/* Routing kernels for the grid autorouter (AUTOROUTE), compiled to WebAssembly — see scripts/build-wasm.sh.
   The JavaScript side owns the memory layout: one WebAssembly.Memory per grid, with the grid arrays (occT · occV · esc · avoid
   · edge band · A* scratch · src/tgt bitmaps · PathFinder arrays · heap) at offsets it hands over in the Opts block. The two
   kernels mirror autoroute.js exactly (astar and paint); the JS versions stay as the fallback when WebAssembly is missing.
   No libc: the few maths helpers are written out below. */
typedef unsigned char u8;typedef unsigned int u32;typedef short i16;
#define DBL_INF 1e300
static double fabs_(double v){return v<0?-v:v;}
static double sqrt_(double v){return __builtin_sqrt(v);}
static double hypot_(double a,double b){return sqrt_(a*a+b*b);}

/* ---------- layout + options (filled by JS) ---------- */
typedef struct{
  int N,nx,ny,NL;              /* cells per layer, columns, rows, copper layers */
  int rl;                      /* bitmask of layers tracks may use */
  int k;                       /* net id being routed */
  int useAv,useEsc,useEdge,usePf,useDir;
  int dil,maxExp,sealLim,nAnch;
  float viaC,bot,inner,avC,escC,edgeC,dirC,dirD,pres;
  int exp;                     /* out: expansions */
  int pref[32];                /* preferred direction per layer: 0 none · 1 horizontal · 2 vertical */
  /* array offsets (bytes from memory start) */
  int occT,occV,esc,avoid,edge,gs,par,stamp,dir,src,tgt,pfOcc,pfHist,pfOccV,pfHistV,heapId,heapF,anch,out;
  u32 gen;int hpos;
}Opts;
#define P32(o) ((int*)(o))
#define PF32(o) ((float*)(o))
#define PU8(o) ((u8*)(o))
#define PI16(o) ((i16*)(o))

static const int DX[8]={1,-1,0,0,1,1,-1,-1},DY[8]={0,0,1,-1,1,-1,1,-1};
static const double DC[8]={1,1,1,1,1.4142135623730951,1.4142135623730951,1.4142135623730951,1.4142135623730951};

/* ---------- A* ---------- */
static int gN,gnx,gny,gNL,gk,gdil;static int *occT,*occV;static u8 *srcB,*tgtB;
static int free0(int l,int i){int v=occT[l*gN+i];return v==0||v==gk||tgtB[l*gN+i]||srcB[l*gN+i];}
static int freeC(int l,int i){if(!free0(l,i))return 0;if(gdil<=0)return 1;int x=i%gnx,y=i/gnx;
  for(int dy=-gdil;dy<=gdil;dy++)for(int dx=-gdil;dx<=gdil;dx++){if(dx*dx+dy*dy>gdil*gdil||(!dx&&!dy))continue;int xx=x+dx,yy=y+dy;if(xx<0||yy<0||xx>=gnx||yy>=gny)return 0;int v=occT[l*gN+yy*gnx+xx];if(!(v==0||v==gk))return 0;}return 1;}
static int freeV(int i){for(int l=0;l<gNL;l++){int a=occV[l*gN+i];if(!(a==0||a==gk))return 0;}return 1;}

/* sealed-in check: flood from one side; true when the region closes before reaching the other side or the limit */
static int sealed(Opts*o,u8*from,u8*to,int lim,u32*stamp,u32 mark,int*q){int tot=o->NL*o->N,N=o->N,nx=o->nx,ny=o->ny;int qh=0,qt=0,seen=0;
  for(int id=0;id<tot;id++)if(from[id]){stamp[id]=mark;q[qt++]=id;seen++;}
  while(qh<qt){int id=q[qh++];if(to[id])return 0;if(seen>lim)return 0;int l=id/N,i=id-l*N,x=i%nx,y=i/nx;
    for(int d=0;d<4;d++){int xx=x+DX[d],yy=y+DY[d];if(xx<0||yy<0||xx>=nx||yy>=ny)continue;int j=yy*nx+xx,nid=l*N+j;if(stamp[nid]==mark||!freeC(l,j))continue;stamp[nid]=mark;q[qt++]=nid;seen++;}
    for(int l2=0;l2<o->NL;l2++){if(l2==l||!((o->rl>>l2)&1))continue;int nid=l2*N+i;if(stamp[nid]==mark||!freeC(l2,i))continue;if(!((from[id]&&from[nid])||(to[id]&&to[nid]))&&!freeV(i))continue;stamp[nid]=mark;q[qt++]=nid;seen++;}}
  return 1;}

/* returns the path length written to `out` (target first, source last) or a negative code: -1 expansion limit · -2 no path · -3 sealed */
int astar(Opts*o){
  int N=o->N,nx=o->nx,ny=o->ny,NL=o->NL,tot=NL*N;gN=N;gnx=nx;gny=ny;gNL=NL;gk=o->k;gdil=o->dil;
  occT=P32(o->occT);occV=P32(o->occV);srcB=PU8(o->src);tgtB=PU8(o->tgt);
  int*esc=o->useEsc?P32(o->esc):0;int*av=o->useAv?P32(o->avoid):0;u8*edge=o->useEdge?PU8(o->edge):0;
  float*gs=PF32(o->gs);int*par=P32(o->par);u32*stamp=(u32*)PU8(o->stamp);signed char*dir=(signed char*)PU8(o->dir);
  i16*pfOcc=o->usePf?PI16(o->pfOcc):0;float*pfHist=o->usePf?PF32(o->pfHist):0;i16*pfOccV=o->usePf?PI16(o->pfOccV):0;float*pfHistV=o->usePf?PF32(o->pfHistV):0;
  int*hid=P32(o->heapId);float*hf=PF32(o->heapF);double*anch=(double*)PU8(o->anch);int*out=P32(o->out);
  o->exp=0;
  /* generations: gen ≤ 2^30 from JS; marks 4·gen+1…4 never collide with an earlier call's marks */
  u32 genB1=o->gen*4+1,genB2=o->gen*4+2,genO=o->gen*4+3,genC=o->gen*4+4; /* two floods and the search each need their own mark */
  if(o->sealLim>0){if(sealed(o,srcB,tgtB,o->sealLim,stamp,genB1,hid)||sealed(o,tgtB,srcB,o->sealLim,stamp,genB2,hid))return -3;}
  /* indexed binary heap: hpos[node] = slot or -1, so a better f sifts the node up instead of pushing a duplicate — capacity = cells */
  int hn=0;int*hpos=P32(o->hpos);
  #define HPUSH(ID,F) {int _id=(ID);float _f=(F);int _i=hpos[_id];if(_i<0){_i=hn++;}while(_i>0){int _p=(_i-1)>>1;if(hf[_p]<=_f)break;hid[_i]=hid[_p];hf[_i]=hf[_p];hpos[hid[_i]]=_i;_i=_p;}hid[_i]=_id;hf[_i]=_f;hpos[_id]=_i;}
  double pres=o->pres,avC=o->avC,viaC=o->viaC,bot=o->bot,inner=o->inner,escC=o->escC,edgeC=o->edgeC,dirC=o->useDir?o->dirC:0,dirD=o->dirD;
  for(int id=0;id<tot;id++)if(srcB[id]){gs[id]=0;stamp[id]=genO;par[id]=-1;dir[id]=-1;hpos[id]=-1;int i=id%N;double x=i%nx,y=i/nx,m=DBL_INF;
    for(int a=0;a<o->nAnch;a++){double dx=fabs_(anch[2*a]-x),dy=fabs_(anch[2*a+1]-y);double d=(dx>dy?dx:dy)+0.41421356237309503*(dx<dy?dx:dy);if(d<m)m=d;}HPUSH(id,(float)(m*1.08));}
  while(hn){
    int id=hid[0];hpos[id]=-1;hn--;if(hn>0){int lid=hid[hn];float lf=hf[hn];int i=0;for(;;){int c=2*i+1;if(c>=hn)break;if(c+1<hn&&hf[c+1]<hf[c])c++;if(hf[c]>=lf)break;hid[i]=hid[c];hf[i]=hf[c];hpos[hid[i]]=i;i=c;}hid[i]=lid;hf[i]=lf;hpos[lid]=i;}
    if(stamp[id]==genC)continue;stamp[id]=genC;
    if(tgtB[id]){int n=0;int c=id;while(c>=0){out[n++]=c;c=par[c];}return n;}
    if(++o->exp>o->maxExp)return -1;
    int l=id/N,i=id-l*N,x=i%nx,y=i/nx;double g0=gs[id];int d0=dir[id];double lc=l==NL-1?bot:(l?inner:1);
    for(int d=0;d<8;d++){int xx=x+DX[d],yy=y+DY[d];if(xx<0||yy<0||xx>=nx||yy>=ny)continue;int j=yy*nx+xx;if(!freeC(l,j))continue;
      if(d>=4&&(!freeC(l,y*nx+xx)||!freeC(l,yy*nx+x)))continue;
      int nid=l*N+j;if(stamp[nid]==genC)continue;int ev=esc?esc[l*N+j]:0;
      double wr=1;if(dirC){int p=o->pref[l];if(p){if(d>=4)wr=dirD;else{int horiz=d<2;wr=((p==1)==horiz)?1:dirC;}}}
      double step=DC[d]*lc*wr;if(av){int a=av[l*N+j];if(a!=0&&a!=gk)step*=avC;}
      if(pfOcc){int oc=pfOcc[l*N+j];step*=(1+pfHist[l*N+j])*(oc>0?1+pres*oc:1);}
      double ng=g0+step+((d0>=0&&d0!=d&&d0<8)?0.35:0)+((ev!=0&&ev!=gk)?escC:0)+((edgeC&&edge&&edge[j])?edgeC:0);
      if(stamp[nid]!=genO&&stamp[nid]!=genC){stamp[nid]=genO;hpos[nid]=-1;gs[nid]=(float)ng;par[nid]=id;dir[nid]=d;}
      else if(ng<gs[nid]){gs[nid]=(float)ng;par[nid]=id;dir[nid]=d;}else continue;
      double m=DBL_INF;for(int a=0;a<o->nAnch;a++){double dx=fabs_(anch[2*a]-xx),dy=fabs_(anch[2*a+1]-yy);double dd=(dx>dy?dx:dy)+0.41421356237309503*(dx<dy?dx:dy);if(dd<m)m=dd;}
      HPUSH(nid,(float)(ng+m*1.08));}
    /* via */
    int fv=-1;for(int l2=0;l2<NL;l2++){if(l2==l||!((o->rl>>l2)&1))continue;int nid=l2*N+i;if(stamp[nid]==genC||!freeC(l2,i))continue;
      int thr=(srcB[id]&&srcB[nid])||(tgtB[id]&&tgtB[nid]);if(!thr){if(fv<0)fv=freeV(i)?1:0;if(!fv)continue;}
      double vc=viaC;if(pfOcc){int ov=pfOccV[i],ot=pfOcc[l2*N+i];vc*=(1+pfHistV[i]+pfHist[l2*N+i])*((ov>0||ot>0)?1+pres*(ov+ot):1);}
      double ng=g0+vc;
      if(stamp[nid]!=genO&&stamp[nid]!=genC){stamp[nid]=genO;hpos[nid]=-1;gs[nid]=(float)ng;par[nid]=id;dir[nid]=8;}
      else if(ng<gs[nid]){gs[nid]=(float)ng;par[nid]=id;dir[nid]=8;}else continue;
      double m=DBL_INF;for(int a=0;a<o->nAnch;a++){double dx=fabs_(anch[2*a]-x),dy=fabs_(anch[2*a+1]-y);double dd=(dx>dy?dx:dy)+0.41421356237309503*(dx<dy?dx:dy);if(dd<m)m=dd;}
      HPUSH(nid,(float)(ng+m*1.08));}
  }
  return -2;}

/* ---------- paint: keep-out halo of one copper shape on the track and via grids ---------- */
static void mark(int*arr,int i,int k){int v=arr[i];if(v==-1)return;if(k==-1||(v!=0&&v!=k))arr[i]=-1;else arr[i]=k;}
/* kind 0 = capsule (ax,ay)-(bx,by) radius r · kind 1 = rectangle centre (ax,ay) half sizes (bx,by), c/s = cos/sin(−angle)
   lmask = layers · k = net id (−1 = hole) · mT / mV = track / via halo radius */
void paint(Opts*o,double g,double ox,double oy,int kind,double ax,double ay,double bx,double by,double r,double c,double s,int lmask,int k,double mT,double mV){
  int N=o->N,nx=o->nx,ny=o->ny;int*oT=P32(o->occT),*oV=P32(o->occV);double m=mT>mV?mT:mV;
  double x0,y0,x1,y1;if(kind==0){x0=(ax<bx?ax:bx)-r-m;y0=(ay<by?ay:by)-r-m;x1=(ax>bx?ax:bx)+r+m;y1=(ay>by?ay:by)+r+m;}else{double e=hypot_(bx,by)+m;x0=ax-e;y0=ay-e;x1=ax+e;y1=ay+e;}
  int cx0=(int)((x0-ox)/g);if(cx0<0)cx0=0;int cy0=(int)((y0-oy)/g);if(cy0<0)cy0=0;
  double fx1=(x1-ox)/g,fy1=(y1-oy)/g;int cx1=(int)fx1;if(fx1>cx1)cx1++;if(cx1>nx-1)cx1=nx-1;int cy1=(int)fy1;if(fy1>cy1)cy1++;if(cy1>ny-1)cy1=ny-1;
  /* floor for the lower bound (JS: Math.floor) — (int) truncates toward zero; the bounds are clamped at 0 anyway */
  double ddx=bx-ax,ddy=by-ay,len=ddx*ddx+ddy*ddy; /* c,s = cos(−ang), sin(−ang) of the rectangle, from JS */
  for(int y=cy0;y<=cy1;y++){double py=oy+y*g;for(int x=cx0;x<=cx1;x++){double px=ox+x*g;double d;
      if(kind==0){double t=len?((px-ax)*ddx+(py-ay)*ddy)/len:0;t=t<0?0:t>1?1:t;d=hypot_(px-ax-t*ddx,py-ay-t*ddy)-r;}
      else{double dx=px-ax,dy=py-ay;double lx=fabs_(dx*c-dy*s)-bx,ly=fabs_(dx*s+dy*c)-by;d=(lx>0||ly>0)?hypot_(lx>0?lx:0,ly>0?ly:0):(lx>ly?lx:ly);}
      if(d>m)continue;int i=y*nx+x;
      for(int l=0;l<o->NL;l++){if(!((lmask>>l)&1))continue;if(d<=mT)mark(oT+l*N,i,k);if(d<=mV)mark(oV+l*N,i,k);}}}
}
