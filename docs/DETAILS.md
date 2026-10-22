# AllinOneDesign — 기능 상세 노트 (버전별)


> 버전별로 더해진 기능의 자세한 동작과 명령어입니다. 개요는 [README](../README.md), 사용 설명서는 [docs/manual.html](manual.html)을 보세요.

시스템 설계부터 회로·PCB·기구까지 한 화면에서 순서대로 진행하는 단일 HTML 설계 도구입니다. 상단의 단계 표시줄로 이동합니다.

1. **시스템 다이어그램** — 부품을 정하지 않은 **HW 블록 다이어그램**(아키텍처)을 그립니다. 블록은 전원(Battery Input · PMIC / LDO / Buck · Watchdog / Reset) → 통신(CAN-FD Bus · Transceiver) → 제어(Main MCU: Core · ADC · PWM/Timer · Safety) → 구동·센싱·진단(H-Bridge / Gate Driver · Current Sensing & Temp. · Debug / Calib.) → 외부 연결(External Connector) 띠로 나뉘고, 화살표에 레일(VBAT 12 V, VCC_MCU 3.3 V…)·버스(CAN_H / CAN_L)·제어/피드백 신호(Control PWM/EN, Analog Feedback ADC…)를 적습니다. 띠를 건너뛰는 전원은 받는 블록 위에 `⇢ VCC_DRV 12 V` 태그로 표시합니다.
   - 결정론: 요구사항 문장 → `arch` 규칙(전압·배터리, CAN/CAN-FD/LIN/이더넷, DC/BLDC 모터, 전류·온도·홀 센싱, ECU·ASIL → 워치독·안전, XCP·JTAG 디버그, 플래시, LED/버튼).
   - 편집: `block <그룹> "<이름>" --feat "…"` · `feat` · `rename` · `move` · `link <A> <B> "<라벨>" --kind power|signal|bus --both` · `unlink` · `del`, 또는 오른쪽 패널에서 이름·그룹·기능을 고칩니다.
   - AI 모드: Claude가 같은 명령으로 블록과 인터페이스를 설계합니다(부품 번호는 쓰지 않음, 회로 생성은 요청할 때만).
   - 블록마다 `impl`로 회로 라이브러리 블록을 연결해 두면(기본값은 규칙으로 채움) **다음: 회로 생성**이 그 블록들로 회로도와 보드를 만듭니다. 대응 블록이 없는 HW 블록(예: Watchdog, Relay Driver)은 알려 주고 회로 단계에서 직접 추가합니다.
   - **부품 구성** 탭은 회로 계획·보드의 부품 수준 다이어그램입니다. **보드에서 추출**은 불러온 보드에서 부품 번호를 뺀 HW 블록을 가져옵니다. SVG로 저장할 수 있습니다.
2. **회로** — 다이어그램의 블록으로 **회로만** 만듭니다(`다음: 회로 생성`): 부품 선정 · 넷리스트 · MCU 핀 배정 · 회로도. 부품 배치·배선은 하지 않습니다. 회로도 편집·회로 CLI는 아래 설명과 같습니다.
3. **PCB** — 처음 들어오면 **PCB 설계 시작** 카드가 열립니다: 동박 층(2/4/6/8/10), 보드 크기(최소화 · 자동 · 직접), 배치 전략, 이어서 자동 배선을 고르면 배치·배선 CLI가 `board layers` → `board minimize`/`reset` → `route`를 차례로 실행합니다. 1단계에서 적어 둔 PCB 조건(예: "8층, 크기 최소화")이 미리 채워집니다. 이 단계에서는 배선을 위해 **회로를 함께 고칠 수 있습니다** — `pinswap`으로 MCU 핀 배정을 배선하기 좋게 바꾸면 보드 넷·회로도·HSIS가 함께 바뀌고, 분할 보기에서 회로도를 직접 편집할 수도 있습니다. 시뮬레이션, 3D/TOP/BOTTOM 보기.
4. **기구 CAD** — 보호 하우징을 Text-to-CAD 콘솔로 설계합니다. PCB가 배치된 뒤에 열립니다.

## 보드 외곽 그리기 도구 (v1.47.0)

- `src/app/shapeui.js`: PCB 편집 도구 **외곽 그리기 (O)** — 하위 모양 사각형·라운드(코너 R 입력)·원·타원은 끌어서, 다각형은 꼭짓점 클릭(첫 점 재클릭·더블클릭·Enter로 완성, Esc 취소), 꼭짓점 모드는 현재 외곽의 점을 끌어 수정, 컷아웃 원·사각은 끌어서 추가, 컷아웃 지우기는 클릭. 격자 스냅, 미리보기(치수 표시).
- `PCBEDIT.setOutlineRing(B,ring,meta)`: 보드 좌표로 그린 링을 외곽으로 — 원점을 링의 왼쪽 아래로 옮기면서 부품·트랙·비아·구멍을 같이 이동(`translateAll`)해 부품이 새 외곽에 대해 제자리에 있도록, 밖으로 나간 컷아웃·장착 구멍은 삭제, `B.shape={kind:'poly'|…}`. 되돌리기는 이동량까지 복원.
- `pcbui`: 도구 목록·툴바(하위 모양 줄)·peDown/Drag/Up/Click/Dbl/키(Enter·Esc·O) 위임, 오버레이에 미리보기.

## ECU 라우팅 기준 — 우선순위 · 리턴 비아 · 외곽 금지 · 접지 분리 · 써멀 비아 (v1.46.0)

- `autoroute.netPrio(B,net,W)`: 0 대전류 전원·구동(전류 ≥ 0.5 A 레일·모터 상·GND) → 1 고속·클록·차동(`HS_RE`: XTAL·CLK·CAN_H/L·USB D±·SPI SCK·SWCLK·PWM_U/V/W·LIN…) → 2 민감 아날로그(`AN_RE`: ADC·SENSE·VREF·VMON·NTC·HALL·TORQUE…) → 3 일반 디지털. `route`는 모든 전략에서 이 순서(같은 등급 안에서는 짧은 넷 먼저)로 배선하고 "배선 순서" 줄을 출력(`--order length`로 끔). 노이즈 전략은 스위칭 넷을 0등급으로.
- 외곽 금지 띠: `prepare`가 외곽(다각형 포함) 2 mm 안 셀을 `G.edgeBand`로 표시, 1등급(고속) 넷의 A*에 셀당 1.5 비용 추가(`--edge N`, `--no-edge`).
- 리턴 비아: `autoroute.returnVias(B,{dist,clear,via,W})` — GND 플레인/동박면이 있을 때 고속·아날로그 넷의 층 전환 비아 0.8 mm(→1.0→1.3) 옆 8방향 중 빈 자리에 GND 비아(`ret:true`) 추가. `route`가 기본 실행(`--retvia 0.8`, `--no-retvia`), 결과 "리턴(GND) 비아 N개 추가 · 자리 없음 M개".
- 가이드라인 규칙 5개 추가(프리셋별 가중치): `rt_priority`(우선 넷 우회율 = 배선 길이/맨해튼 거리, 2.2× 초과 지적), `rt_return_via`(신호 비아 1 mm 내 GND 비아 비율, 고속 넷 비아 > 2개 지적), `rt_edge_keepout`(고속 트랙 중 외곽 2 mm 띠 비율), `pw_agnd_star`(아날로그 부품군 ↔ 스위칭·구동 부품군 거리 ≥ 8 mm, AGND가 있으면 GND 연결점 1개), `th_via_array`(노출 패드 아래 비아 수 / 필요 수). 디커플링(`pl_decoupling`·`sch_decap`·`sch_bulk`)과 열 패드(`ds_thermal_pad`)는 기존 규칙.
- AI 프롬프트에 라우팅 기준과 규칙 키 안내.

## 전류 기반 배선 폭 (v1.45.0)

- 이전: 넷 이름으로 전원(0.3 mm)/신호(0.2 mm)만 구분, 전류는 보지 않음.
- `src/core/current.js` (`CURRENT`): IPC-2221 `ipcWidth(I,{oz,dT,inner})`·`ipcCurrent`·`ipcRise`; 부품 부하표 `LOADS`(모터 드라이버·게이트 드라이버·벅·LDO·PMIC·MCU·CAN·플래시·센서 앰프·LED·RF, 부품 번호 정규식 → A·역할); 레일 전압은 넷 이름(`+12V`, `VCC_5V`, `+3V3`, `VIN_RAW`…)에서, 모터 상 넷은 이름(`PH_U`, `OUT1`, `MOTOR_A`…)에서. `netCurrents(B)`: 부품마다 전원 레일에 소비 전류를 더하고(레귤레이터는 출력 레일 전류 × V비/효율로 입력 레일에), 모터 드라이버는 상 넷에 상전류(요구사항의 "N A" 또는 블록 `params.i`, 없으면 부품 정격)와 전원 레일에 0.7×, 입력 보호 넷은 첫 레일과 동일, GND는 최대 레일 전류. `widths(B,{oz,dT,cap})`: 권장 폭·상한(기본 3 mm, 넘으면 동박면 권장)·사용자 지정(`B.netWidth`, `B.netCurrent`). `check(B)`: 배선된 트랙이 권장의 85 % 미만이면 온도 상승과 함께 경고. `text(B)` 표.
- 배선기: `widthFor`가 `o.netWidth[net]`(상한 `widthCap`)을 우선. 넓은 넷은 A*에서 중심선 주변 `dil` 셀(기본 폭 대비 초과분)까지 비어 있어야 통과(할로는 기본 폭으로 칠해져 있으므로).
- 콘솔: `width`(표) · `width <넷> <mm|auto>` · `width <넷> --current A` · `--oz`·`--dt`; `route --iw [--iwmax 2]`로 전원·모터 넷(≥0.5 A, 권장 > 기본 전원 폭)에 적용, 지정 폭은 항상 적용; 넓은 폭으로 자리가 없으면 기본 전원 폭으로 다시 배선하고 "동박면으로 보강" 안내; `drc`에 "전류 대비 폭 부족" 항목. 문장: "전류 기준으로 폭 맞춰 배선", "PH_U 폭 2mm로", "+12V 전류 4A로 배선". AI 프롬프트에 width/route --iw 안내. 스냅샷에 netWidth/netCurrent/oz/dT 저장.

## 보드 외곽을 따르는 하우징 (v1.44.0)

- 이전: 하우징은 보드의 바운딩 사각형(Lo×Wo, 코너 R)만 사용 → 원형·타원·L자 보드도 사각 하우징.
- `housing.js`: 다각형 도우미 `offsetRing`(CCW 링을 d만큼 바깥/안쪽으로 오프셋, 마이터·베벨), `ringPoints`(둘레를 따라 n점), `ringHit`(점에서 방향으로 쏜 선이 링을 만나는 점·법선), `shapedBoard`. `boardNeeds`에 `ring/shaped/shapeKind`. `design()`: shaped면 `geo.ringI`(= 보드 외곽 + gap) · `geo.ringO`(= + rim) · `areaO/areaI/perO`, 외형 치수는 링의 바운딩, 커버 나사는 둘레를 따라 균등 배치, 지지 보스는 구멍이 없으면 외곽 안쪽 4점(중앙 보스 후보는 보드 안만), 핀(fins)은 안쪽 링에 완전히 들어가는 것만(`fins.keep`), 체적·질량은 링 면적·둘레로.
- 3D(`mechui.mechGroup`): shaped면 네 벽 대신 **링 벽 한 덩어리**(바깥 링 − 안쪽 링 extrude), 바닥·커버 판·R/C 밴드는 링 오프셋으로, 커넥터 창·벽 구멍은 벽 면에 투영한 마커(`ringHit`), 가스켓 선은 링 오프셋.
- 도면 SVG·부품도 SVG: 평면도가 다각형 경로(외곽·안쪽·R/C·O-링 홈), 보드 외곽도 다각형. OpenSCAD: `psolid(pts,z,layers)` + `outerPts/innerPts` polygon 기반 shell. `HOUSING.text`에 "보드 외곽을 따르는 하우징 (원형) · 바닥 면적 · 둘레".
- `PCBEDIT.setShape`: 새 외곽 밖으로 나간 장착 구멍은 삭제(메시지에 표시).

## 양면 배치 옵션 (v1.43.1)

- 기본은 **상단 단면**(SMT 리플로 1회 · 가장 싼 조립 · 커넥터·스루홀·전해 캡은 어차피 상단). `--both`가 있어야 하단을 쓰며, 이전엔 2핀 수동소자만 하단 후보였음.
- `autoplace`: `--both`면 수동소자 + **소형 SMD IC**(바운딩 ≤ 7 mm: SOT-23·SOIC-8급, MCU·드라이버·레귤레이터·FET·0.3 W 이상 발열 부품 제외)도 하단 후보. `bothIcs:false`면 2핀만.
- 3단계 시작 카드 "양면 배치" 체크 → `reset/board minimize --both`. 문장: "양면으로 다시 배치", "하단에도 부품 놓고 배선" → `--both`. AI 프롬프트에 단면/양면 규칙.

## 회로 안 단가 모델 — 부품 + PCB + 조립 + 등급 (v1.43.0)

- 왜 비슷했나: 세 안은 헤더·플래시·LED·LDO↔벅 같은 센트 단위 블록만 바꾸고, MCU(TC364 $17.5 = 부품값 65%)·드라이버·CAN은 요구사항으로 고정이라 부품값이 거의 같았음. PCB·조립·등급은 아예 없었음.
- `newproj.costModel(r,B,{layers,grade})`: PCB 제작 `$/cm²`(2층 0.065 · 4층 0.14 · 6층 0.24 · 8층 0.36 · 10층 0.5, 셋업 $0.6) × 추정 보드 면적, 조립 `1.2 + 부품×0.03 + 패드×0.01 + 스루홀 핀×0.04`, 등급 계수(상용 1.0 · 산업 1.12 · 핵심 IC AEC 1.2 · 전 IC AEC 1.35 · 전 부품 AEC+보호 1.5)를 U/Q/D/J/Y 부품값에 적용. 500개 기준 추정.
- `variants`: 안별 티어 — 저가형 2층(모터+AURIX면 4층)·상용(차량이면 핵심 IC만 AEC), 표준 4층(모터/CAN)·전 IC AEC, 확장형 4층(AURIX+모터면 6층)·전 부품 AEC. `plan.pcb.layers`가 3단계 시작 카드 기본 층수로 이어짐. `planMetrics.price`는 예상 단가(총액), `partsPrice`는 부품값, `cost`에 내역. 저가형 diff에 "MCU는 요구사항으로 고정" 설명.
- 카드: 예상 단가 + 내역 줄(부품 · PCB n층 · 조립 · 등급), BOM 버튼·회로 생성 메시지·`variants` 텍스트에 내역. 가격 점수는 총액 기준.

## 부품 이동·뒤집기 뒤 자동 재배선 (v1.42.1)

- `pcbcli.cliOne` (`move`·`rotate`·`flip`): 부품의 패드가 움직이면 트랙은 그 자리에 남아 끊기므로, 그 부품 넷(플레인 넷 제외)의 **자동 배선 트랙·비아를 지우고 바로 `route --nets …`로 다시 배선**. `--no-route`면 지우기만 하고 "열린 연결 N개 → route" 안내. 손으로 그린 트랙은 보존(끊기면 래츠네스트·DRC에 표시). 되돌리기 1회로 이동+재배선 복원.
- 문장 규칙: "U3를 하단으로/뒤집어", "C5를 20,30으로 옮겨", "U1 90도 돌려", "배선 없이 …" → flip/move/rotate [--no-route]. AI 프롬프트에 동작 설명.

## 보드 외곽 모양 — 사각형 외 (v1.42.0)

- `pcbedit.js`: `SHAPES` rect · round · circle · oval(스타디움) · L · T · hex · oct · poly. `shapeRing(kind,p)` → 외곽 링, `setShape(B,kind,p,{anchor})` → `B.outline[0]`·W·H·`B.shape` 갱신 + 보드 밖 부품 목록, `addCutout(B,'circle'|'rect',{x,y,d|w,h,r})` → 안쪽 링(구멍) 추가(`B.cutouts`), `clearCutouts`, `shapeText`. `resizeBoard`는 모양 보드를 비례 파라미터로 다시 생성(원형은 min(W,H) 지름). `PCB.inBoard(x,y,outline)` = 외곽 안 ∧ 구멍 밖.
- 배치: `autoplace`가 외곽(모든 꼭짓점·중심)과 컷아웃(바운딩 겹침)을 피함. 배선: `autoroute.outlineBlock`이 컷아웃 셀을 막고 테두리 캡을 칠함. 3D·KiCad 내보내기는 이미 다중 링 지원.
- 3단계 시작 카드: **보드 모양** 선택(사각형·라운드·원형·타원·L자·T자·육각·팔각) + 모양 값(코너 R · 지름 · 절개 가로x세로 [tr|tl|br|bl] · 폭). 최소화와도 조합.
- 콘솔: `board shapes` · `board shape <kind> [가로 [세로]] [--corner R] [--cut WxH] [--at tr|tl|br|bl] [--pts "x,y …"] [--anchor center]` · `board cutout circle <d> --at x,y` · `board cutout rect WxH --at x,y [--corner R]` · `board cutout clear` (되돌리기 지원). 문장: "보드를 원형 60mm로", "L자로 100x60 절개 40x25 오른쪽 위", "육각형 보드 50mm", "라운드 모서리 R3". AI 프롬프트에 모양·컷아웃 명령 안내. 상태·보고서·요약 시트에 모양 표시, 스냅샷에 shape/cutouts 저장.

## 블록별 부품 후보 — 제조사별로 고르기 (v1.41.0)

- `products.js` `PARTS`: 템플릿 블록마다 **제조사가 다른 후보 3–5개** `[MPN, 제조사, 한 줄 특징]` — 안전 PMIC(TLF35584·TPS65381A-Q1·FS2600·L9396), 락스텝 MCU(TC364·S32K344·SPC58·RH850/U2A·TMS570), CAN-FD(TJA1443·TLE9251·TCAN1043·MCP2542FD·ATA6563), 3상 게이트 드라이버(TLE9180·L9908·DRV8353·GD3000·A4919), 40 V MOSFET, 션트 앰프/전류 센서, 역접속 보호, HSD/LSD/LIN, 절연 AFE·ΔΣ·전압 앰프, 절연 게이트 드라이버, 파워 모듈, RDC, 각도·토크 센서. `candidates(prof,id)`로 조회(AI 프로필은 `parts` 객체 {mpn,mfr,note,grade}를 같은 형식으로 검증). 요약 출력에 "후보: …" 표시.
- 1단계 흐름: 블록 Q&A 뒤 **부품 선정 Q&A** — 후보가 있는 블록마다 `[블록] 부품을 고르세요`(선택지: 후보 · 라이브러리 기본 유지 · 나머지 모두 1순위). 건너뛰면 1순위.
- `npSetPart`: 블록에 `part{mpn,mfr,note}` 기록 + 기능 줄 "부품: MPN (제조사)". 블록이 교체 가능한 단일 IC(can·bldc·dcmotor·hs_switch·vmon·uart·i2c·flash·led·button, 또는 구현 없음)이고 핀을 알면(라이브러리, AI 모드면 Claude 추정) `impl <id> part <MPN>`으로 회로 구현까지 교체; 핀을 못 얻으면 구현을 되돌리고 기록만. 전원/SBC/MCU처럼 복합 블록은 기록만(2단계 `add part`로 교체 가능). `map`에 "· 부품 MPN" 표시.
- 콘솔 `parts` (후보 목록) · `parts <블록>` · `parts <블록> <번호|MPN>`.

## 제품 프로필 — 표준 블록 먼저, 블록별 Q&A (v1.40.0)

- `src/core/products.js` (`PRODUCTS`): 제품(차량용 ECU)마다 **표준 구성**을 프로필로 둠 — `defaults`(표준 요구사항 문장), `req`(규칙 엔진용 키워드), `blocks`(id·group·label·feats·impl·parts·why), `links`, `questions`(블록에 매인 질문; 선택지마다 `effect`: feats/add/links/remove/impl/dup/asil/req). `apply(prof,answers,name)`가 HWARCH 아키텍처를 결정론적으로 만들고 답변 효과를 반영(자유 입력은 해당 블록 feats에 "요구: …"로 기록), `req`에 ASIL 충돌을 정리한 요구 키워드 반환.
- 내장 템플릿: **EPS**(KL30/KL15, Safety PMIC/SBC, 락스텝 MCU, CAN-FD, 게이트 드라이버, 3상 인버터, 페이즈 컷, 상전류·토크·각도 센서 IF; 질문: 타입/상전류, 토크센서 IF, 위치센서, 리던던시(2채널 복제), 추가 통신), **BMS**(절연 AFE 체인, 팩 전류, HV/절연 감시, 컨택터·프리차지; 질문: 팩 전압/셀 수, 전류 방식, ASIL, 밸런싱), **BCM**(SBC, HSD 어레이, LSD/릴레이, 스위치 입력, LIN; 질문: 채널 수, LIN 수, 모터 구동, ASIL), **트랙션 인버터**(절연 게이트 전원·드라이버, 파워 모듈, 리졸버, HV 측정; 질문: 전압/소자, 위치 센서, ASIL).
- AI 모드: `PRODUCTS.aiPrompt(req)`로 Claude가 **어떤 제품이든** 같은 형태의 프로필(블록 8–16개·질문 3–6개·효과)을 만들고(`fromAi`로 검증), 못 알아보면 `{product:null}` → 내장 템플릿 → 기존 일반 질문 흐름. 규칙 모드는 템플릿 정규식으로 감지.
- `newui.npAnalyze`: 프로필이 있으면 요약(제품·표준 요구·필요 블록 목록) 출력 → 요구사항에 이미 적힌 질문(`re`)은 건너뛰고 블록별 질문만 copAsk(`[블록명] 질문`) → `apply` → 요구사항 "보강: 제품 … · 키워드" → 기존 ASIL 메커니즘 제안으로 이어짐. 요구사항에 "템플릿 없이/직접 구성"이 있으면 프로필을 쓰지 않음. 빠른 시작 칩 EPS ECU · BMS 추가.

## GitHub Copilot CLI 연동 (v1.39.0)

- `scripts/serve.mjs --copilot` (`npm run serve:copilot`, 또는 `AI_BACKEND=copilot`): `POST /v1/messages`(페이지가 쓰는 Anthropic Messages 형식)를 **GitHub Copilot SDK**(`@github/copilot-sdk`, Copilot CLI 런타임 내장)로 처리. 요청의 `tools`를 `defineTool`로 세션에 등록하고, Copilot이 도구를 부르면 핸들러가 대기 → 페이지에 `stop_reason:"tool_use"` + `copilot_run` ID로 응답 → 페이지가 명령을 실행해 `tool_result`를 같은 `copilot_run`으로 보내면 핸들러를 풀어 다음 응답(또 도구 호출 또는 최종 답)을 돌려줌. 세션은 `availableTools`를 앱 도구로 제한하고 시스템 메시지로 파일·셸 금지. 인증: 저장된 Copilot/gh 로그인 또는 `COPILOT_GITHUB_TOKEN`/`GH_TOKEN`; 미로그인은 401 + 안내. 모델: `COPILOT_MODEL` > 요청 모델(Anthropic ID 형식이면 무시) > Copilot 기본. `GET /v1/backend`로 백엔드 알림.
- `localai.js`: 응답의 `copilot_run`을 다음 라운드에 실어 보냄, `laiBackend()`로 백엔드 조회 → 머리 "AI 대기 · GitHub Copilot", 연결 확인에 백엔드 표시. Anthropic 전달 때는 `copilot_run` 제거.
- `package.json`: `optionalDependencies` `@github/copilot-sdk`, `serve:copilot` 스크립트, package-lock 추가.

## 부품 지정은 교체 · 로컬 AI 웹 검색으로 데이터시트 (v1.38.1)

- `impl <ID> part <MPN>`: 블록에 이미 `part`가 있으면 그 부품을, 없으면 주 라이브러리 구현(bldc·can·mcu … LDO/벅/캡/TVS/LED 제외)을 **교체**(메시지 "(bldc → A4911; 둘 다 두려면 --add)"). `--add`로 추가. `map`/응답에 `part <MPN>` 표시.
- `remove <MPN>`: 부품 번호로 구현 삭제(블록 ID·종류보다 먼저 매칭), HW 블록은 남김(`--block`이면 블록도 삭제). 삭제 후 블록 ID 재부여 문제 회피.
- 로컬 AI(Messages API)에서는 부품 조회(`impl … part`, `add part`, `replace`, 라이브러리 "Claude 추정") 때 Anthropic **웹 검색 도구**(`web_search_20250305`, 최대 5회)를 붙여 Claude가 제조사 데이터시트를 찾아 핀 배열을 읽고 `pdf`·`conf`를 채움(레코드 note "웹 검색 · URL"). 설정 "웹 검색" 체크로 끔. claude.ai 아티팩트의 `sample`에는 웹 접근이 없어 기억으로 추정.
- 시스템 프롬프트: 부품 지정은 교체이므로 먼저 remove 하지 말 것.

## 로컬 AI — claude.ai 밖에서 Messages API (v1.38.0)

- `src/app/localai.js`: `window.claude`가 없으면(파일·다른 서버) `[Claude 허용]`이 **로컬 AI 설정**을 엶. 설정(`pcbv.localai`): 직접(API 키 + `anthropic-dangerous-direct-browser-access`) 또는 프록시 URL, 등급별 모델(`claude-haiku-5-5` / `claude-sonnet-5-5` / `claude-opus-5-5`) 또는 고정 모델. `laiBuild()`가 sample 호환 함수 생성: `sample(prompt,{tools,signal,modelTier,onText})` — tool_use 루프(최대 40라운드, execute → tool_result), `sample.json` — 코드펜스/중괄호 추출 후 JSON 파싱, `limits()`. 오류 코드는 기존 처리와 맞춤(401/403 → `not_granted`, 429 → `rate_limited`, 중단 → `cancelled`).
- `pcbcli.cliAiProbe`: `window.claude` 없고 설정이 있으면 `CLI.sample=laiBuild()`; 머리 표시 "AI 대기 · 로컬 API".
- `scripts/serve.mjs` (`npm run serve`): dist/ 정적 서빙 + `POST /v1/messages`를 api.anthropic.com으로 전달(브라우저가 키를 안 보내면 `ANTHROPIC_API_KEY` 사용), CORS 허용. 기본 포트 8787.
- 매뉴얼 "claude.ai 밖에서 AI 쓰기" 절.

## Claude 허용 버튼 (v1.37.4)

- `aimode.js`: AI 모드인데 `claude.use('sample')`이 null이면 도우미 머리에 **[Claude 허용]** 버튼 표시. 플랫폼 내장 `permissions` 기능으로 `state('sample')` → `prompt`면 `request(['sample'])`(허용 대화상자 1회), `denied`면 `manage()`(권한 설정 창, 클릭 시에만), `unavailable`이면 안내(아티팩트 페이지·로그인 필요, 내려받은 파일에서는 불가). 허용 뒤 `cliAiProbe`를 다시 돌려 "AI 대기"로 전환.
- 매뉴얼 "Claude 사용 허용" 절 추가.

## 수량 — 모터 2개 → 드라이버 2개 (v1.37.3)

- `hwarch.archFrom`: 요구사항의 "BLDC 모터 2개/2대/듀얼"을 읽어 드라이버 블록을 N개(`drv`, `drv2` … 라벨 "#n") 만들고 MCU 제어·전원·커넥터 링크를 각각 연결.
- `newui`: `dup <블록ID|회로블록>` — 기존 블록을 구현·연결까지 복제(라벨 #n). 규칙 "BLDC motor는 2개라서 드라이버가 2개 필요함" → 부족한 수만큼 `dup bldc`; `npIsChange`에 필요·개라서; NP_SYS에 수량은 dup으로.

## 1단계 콘솔 무응답 수정 (v1.37.2)

- 원인: `npExec`가 `NP.busy=true`로 둔 채 `npAnalyze`를 부르는데 `npAnalyze`는 `if(NP.busy)return`으로 **조용히 종료** → 규칙에 안 걸리는 문장은 아무 출력이 없었음. `npAnalyze(req,inner)`로 내부 호출 허용.
- AI 모드인데 Claude를 쓸 수 없으면(권한·한도) 한 번 안내(`aimUnavailableNote`)하고 규칙으로 대체. 규칙 추가: "ASIL-C로 대응" → `safety level C` + `safety apply all`, "BLDC 모터 2개 구동" → 부족한 수만큼 `add bldc`; `npIsChange`에 하도록·되도록·대응·적용.

## 블록의 부품 번호 → 회로 구현 (v1.37.1)

- 원인: 부품 구성도·2단계 회로는 `impl`로만 만들어지는데 Claude가 블록 라벨/기능에 부품 번호를 글자로만 적음.
- `newproj.LIB.part`(`--mpn`, `--pins`, `--vcc`): `NEWPROJ.partLookup`(앱이 `plFind`로 덮어씀, 기본은 내장 DB + 알려진 핀 배열) 레코드로 `ctx.part` 생성 — 전원/접지 자동, SPI/I²C/UART/IRQ/RESET·EN 핀은 `ctx.sig`로 MCU 배정(넷 `<MPN8><블록번호>_<핀>`), 풋프린트는 `FPGEN.ensure`, 100 nF 디커플링; 핀 정보 없으면 경고. `ctx.railNear(v)`, `ctx.warn`.
- `newui`: `impl <ID> part <MPN> [--pins …]`(AI 모드면 라이브러리에 없을 때 Claude 추정), `bind` 명령·`npBindParts`(블록 라벨/기능의 부품 번호 토큰 → impl part, AI 생성 뒤 자동 실행), NP_SYS에 "부품을 고르면 impl part로 묶기" 안내.

## 아무 부품이나 추가 — add part (v1.37)

- `schcli.scAddPart(part,o)`: 라이브러리 레코드(핀 배열)로 `SCH.boxSym` 심볼을 만들어 현재 쪽 빈 자리에 놓고, `--pins 핀=넷`(이름/번호) 지정 연결 + 전원·접지 핀 자동 연결(`scRailFor`: GND 넷, VCC는 ≤3.6 V 중 가장 높은 레일, VIN/VBAT는 가장 높은 레일), 나머지 열림. 심볼에 `mpn/desc` 보관 → `apply`(`seAddBoardPart`)가 mpn·설명을 보드 부품에 넘기고 미등록 풋프린트는 `FPGEN.ensure`로 생성. 참조 접두는 분류(커넥터 J · FET Q · 다이오드 D · 기타 U).
- `add part <MPN|설명> [--pins …] [--ref] [--near] [--page] [--noauto]`: `plFind/plSearch` → 핀 없으면 `pinoutFor` → 없으면 `plAskClaude`(AI 모드 에이전트가 호출해도 동작). AI 시스템 프롬프트에 "다른 부품은 add part로 — 추가 못 한다고 하지 말 것".
- `partui.plAddIntent/plAddFlow`: "CC2420 추가해줘" 문장 가로채기(참조·수동 부품 제외), 라이브러리 → Claude 추정/API/파일 질문 → 부품 카드 → 연결 방식 질문(전원·접지 자동 / 연결 없이 / "핀=넷" 직접 입력) → 추가. 회로·PCB 콘솔 모두.

## AI 모드 기본값 (v1.36.3)

- `AIM.mode` 기본값 `ai`(저장된 설정에 버전 표식 `v:2`가 없으면 AI로 재설정), 실행 방식 토글은 AI · 결정론 순. 시작 시 Claude 사용 가능 여부를 확인하고(`cliAiProbe`) 쓸 수 없으면 각 콘솔이 규칙으로 대체. 모든 콘솔(1 시스템 · 2 회로 · 3 PCB · 4 기구)은 AI 모드에서 문장을 먼저 Claude에게 보내고, 규칙 해석은 Claude가 없거나 결정론을 고른 경우에만 씁니다.

## 1단계 부품 구성 변경 요청 수정 (v1.36.2)

- 원인: 다이어그램이 있는 상태에서 "LDO를 벅으로 바꿔줘" 같은 변경 문장이 규칙 해석에 걸리지 않으면 **요구사항에 덧붙여 다시 분석**(npAnalyze)되어 아무것도 바뀌지 않았고, AI 모드에서도 "보드/모듈" 같은 단어가 있으면 재분석으로 빠졌음. 또 `add/set/remove`로 회로 계획만 바꾸면(`planManual`) 이후 `impl`·`safety apply`의 `archToPlan()`이 무시되어 부품 구성도에 반영되지 않았음.
- 수정: `npIsChange`(바꿔·교체·추가·빼·n개로 …)면 재분석하지 않음 — AI 모드는 `npAI`, 결정론은 `npNL2` 규칙("A를 B로", "LED 3개로", "CAN 빼줘", "버튼 추가", "MCU를 TC364로", "입력 24V로"), 못 알아들으면 예시와 함께 안내. `impl --swap <기존>`(파라미터 승계, 첫 일치 항목만 교체). `add/set/remove/mcu`는 아키텍처가 있으면 HW 블록·impl을 함께 고치고 `archToPlan(true)`로 동기화(`npArchImpl`), `safety apply`도 강제 동기화. AI 프롬프트에 "작은 변경은 impl/add/set/remove로, 전체 재생성 금지" 안내.

## HW·SW 안전 메커니즘 추천 (v1.36.1)

- `safety.MECH`에 HW 메커니즘별 `needs`(그 부품이 DC를 내기 위해 필요한 SW), `SW_MECH` 11종(최소 등급·설명·DC), `swMechanisms(A)`(A.safety.sw / MCU 블록 `SW:` 기능 줄로 존재 판정), `hwNeeds(A)`. `apply`는 SW 항목을 ctrl 블록 feats에 `SW: …`로 기록하고 `A.safety.sw`에 저장(`safety apply sw`); `hasMech`는 SW 줄을 무시. `archText` HW/SW/필요한 SW 구분, `fmeda`는 기록된 SW 메커니즘의 DC를 반영.
- `hwarch.svg`: SW 줄은 "⚑ SW 안전 메커니즘 n개" 한 줄로 요약(`bh` 높이 보정). `newui`: 추가 카드 "HW + SW 모두 / HW만 / SW만", `safety sw` 명령. 보고서: HW 표에 "필요한 SW" 열, SW 메커니즘 표.

## 등급 부품 자동 적용 · 점검 (v1.36)

- `partlib`: 레코드 필드 `grade`(`gradeOf` 정규화: Q100-0~3 · Q101 · Q200 · industrial · commercial, MPN 접미 -Q1/Q 시리즈 추정) · `temp` · `asil` · `fitv`; CSV 열 Grade/Temp/ASIL/FIT, Claude 추정 프롬프트·Mouser/Nexar 속성 파싱에 반영. `AUTO_PARTS`(차량용 내장 레코드: TPS3823-Q1 · TLV1117LV-Q1 · TPS54331-Q1 · NVTR4502N · DMP2035UQ · NRVB140SF · SMAJ15A-Q · GCM 커패시터), `AUTO_ALT`(상용 → 핀 호환 대체), `AUTO_HINT`(핀 호환 없음 안내), `autoAlt`, `requiredGrade(level)`, `gradeOk(rec,kind,level)`.
- `parts.js` 내장 DB에 grade/temp/asil/fit 필드(TC364 ASIL D · TLE9251 Q100 · STM32F042 산업용 등).
- `newproj.build`: `plan.asil`(hwarch.toPlan이 A.safety.level에서 복사)이 A 이상이면 `autoAlt` 핀 호환 대체를 자동 적용하고 경고 메시지에 요약; 핀 호환 없는 IC는 힌트 경고.
- `safety.parts/partsText`: 안전 관련 부품의 등급 판정·대체품·힌트, `fmeda`는 레코드 FIT 우선(`fitSrc`)과 등급 열. `schcli`/`pcbcli`: `safety parts [--apply]`(PARTLIB.plan 번호 매핑으로 `plApply` 일괄), `safety check`에 부품 요약 포함. 보고서 "등급 부품" 표, Excel 시트, 지표 타일 "등급 미달 n", 라이브러리/카드 등급 배지, `revSig`에 안전 등급.

## 기능 안전 — ASIL 등급별 설계 (v1.35)

- `src/core/safety.js`: `LEVELS/parseLevel/TARGETS`, `MECH`(등급별 권장 메커니즘: 인식 키워드 · 추가 블록 · 회로 impl · DC), `mechanisms(A)`, `boundaries(A)`(FFI), `apply(A,HWARCH,ids)`(블록·세이프 스테이트 링크 추가), `archText`, `circuitChecks(B,{level,arch})`(supervisor·wdt·wdt_qa·revpol·tvs·drv_fault·drv_en·isense·cutoff2·can_tx·sensor_red·conn_adj·clk), `fmeda`(부품 등급 FIT, 클래스별 DC, SPFM/LFM/PMHF, 목표 판정), `fmedaAoa`, `circuitText`.
- `hwarch`: `A.safety{level,goals}`, `b.asil`, 링크 종류 `safe`(빨강), 블록 ASIL 배지·테두리, FFI 라벨, 범례, `text()`에 안전 요약; 규칙 해석의 Watchdog 블록은 `supervisor` 구현·`safe` 링크.
- `newproj`: 회로 블록 `supervisor`(TPS3823 SOT-23-5: nRESET/PORST + WDI gpio_out), `hs_switch`(AO3401 하이사이드 + AO3400 레벨시프트 + SAFE_EN), `ctx.mcu()/railV()`; `pcb-core` FP `SOT-23-5`.
- `newui`: `safety [status|level|goal|block|apply|ffi]`, 요구사항의 ASIL 자동 적용 + 빠진 메커니즘 질문 카드, 블록 패널 ASIL 선택, 질문 카드 환경 항목에 ASIL A~D, NP_SYS 안내. `schcli/pcbcli`: `safety [check|fmeda|level]`(조회, `analyze safety`), AI 프롬프트 안내. `exportui`: 보고서 "기능 안전" 절, Excel FMEDA·점검 시트. `nextui`: 기능 안전 타일. `hsis`: `asil`·`sm` 필드와 표 열.

## 회로 해석 명령 analyze (v1.34)

- `src/core/analyze.js`: `powerTree`(SIM.extractCircuit의 REG/LOAD/소스로 레일별 공급원·부하·디커플링·경고), `decap`(IC 전원 핀별 접지 커패시터·거리·심각도), `patterns`(RC/LC/FB-π/분압/풀업·풀다운/션트/LED 전류), `acSweep`(복소 MNA: R·C·L, 비드=0.1 Ω+L(Z@f), 다른 전원 레일 AC 접지, 1 V 소스, 로그 스윕, −3 dB·피크), `dcText`(SIM.dcop 요약). 단위 포맷 `fmt`.
- `schcli.scAnalyze`(회로 콘솔, PCB 콘솔 `analyze`도 같은 함수): power · decap · rc · ac(--from/--to/--fmin/--fmax) · dc · ir(simui `irConfig/irPickNet/runIR`, --net/--total) · si(`runSI`, zmin/zmax·폭·비아·차동 쌍) · thermal/emc(`cliReport`) · all. 읽기 전용이라 질문 모드에서 허용되고, AI 시스템 프롬프트에 "숫자 질문은 analyze 먼저" 규칙. 규칙 해석: "해석/분석/디커플링/전원 트리/동작점/전압 강하" → analyze.

## 회로 콘솔 보강 명령 — 테스트 포인트 · NC 핀 · 직렬 삽입 (v1.33)

- `schedit.LIB`에 `TP`(1핀, `SCH.onePin` 심볼, 풋프린트 `TP-1.5`/`TP-1.0`/`TP-TH`), `TVS`, `Z`(SOD-123), `F` 추가. `kindOf`는 `TP*`를 3D 몸체 없음으로, 실크는 참조만, BOM 참고가·BOM 표에서 제외.
- `schcli`: `scAddOne`(배치 내부용) 분리, `--pins`에 핀 토큰(`U1.12`/`U1.PA3`) 허용(`scNetFor`: 연결된 핀은 그 넷, 빈 핀은 핀 이름의 새 넷 + 핀 연결). 새 명령 `hsis`(HSIS 신호 목록·분류·넷·TP), `tp`(HSIS 신호 넷/지정 넷에 TP 일괄, 중복 건너뜀, `hsisRun` 갱신), `tie`(빈 핀을 R/C/직접으로 넷에), `insert`(핀 넷에 직렬 부품, 핀 쪽 새 넷). 규칙 해석에 "테스트 포인트 추가"·"NC 핀 저항" 추가, AI 명령 한도 12 → 40, 시스템 프롬프트에 벌크 명령·마무리 `apply`/`erc` 안내, 요약(`scBrief`)에 HSIS 신호 목록. 한국어 문장은 첫 단어가 명령어여도 문장으로 처리(`hsis 기준으로 …`).
- `hsis.check`: 신호 넷의 `TP*` 부품을 찾아 `TP`(ok) / `TP_MISSING`(전원·아날로그·통신, info), `it._tp`; HSIS 표에 **TP** 열.

## 아이콘 시안 적용 (v1.32.1)

- 아이콘 제안서(앱 로고 L-04 "Trace A", 설계 단계 S-01~06, 핵심 기능 F-01~08, 지표 띠 M-01~06, 보기·창 V-01~04)를 `iconui.js`의 16-grid 선 아이콘으로 옮겼습니다. 단계 아이콘은 단계 색(파랑·호박·초록·보라), 기능 아이콘은 강조색 하나, 지표 띠 아이콘은 중립색(상태는 타일 테두리·점).
- 로고: 머리글 브랜드 버튼과 파비콘(SVG data URL)을 배선·패드로 그린 "A"로 교체(`LOGO_SVG`, `logoApply`). `icon()`은 `|` 뒤에 채움 경로를 받습니다(층 선택의 가운데 층).

## 부품 교체 · 부품 라이브러리 (v1.32)

- `src/core/partlib.js`: 부품 레코드 `{mpn,mfr,title,cat,pkg,fp,val,pins:[{num,name}],specs,price,pdf,page,src:user|builtin|ai|api,status,conf}`. CSV/Excel 표 가져오기(`parseTable`, 머리글 별칭 한/영), `toCsv`, 내장 `PARTS` 변환, `merge`(user > builtin > ai > api), `find/search`, 핀 역할(`role`: VIN/VOUT/GND/VCC/EN/FB/NC/PG/SDA/SCL/…), `mapPins`(이름 → 역할 → 번호, 같은 넷의 중복 핀은 merged), `plan`(경고·단가 차이), `aiPrompt/fromAi`(Claude JSON 스펙), `PROVIDERS`(mouser · nexar · custom), 알려진 핀 배열 `PINOUTS`(1117 계열·SOT-23-5 LDO·MCP1700·SOT-23 MOSFET·SMA 다이오드·CAN 트랜시버), `pageHTML`(데이터시트 요약).
- `src/core/fpgen.js`: 패키지 이름·핀 수로 풋프린트 생성(0201~2512 · SMA · SOT-23/-5/-6/-8 · SOT-89 · SOT-223 · TO-252/263/220 · SOIC · TSSOP/MSOP · DFN · QFN · QFP · DIP · HDR-NxM), `FPGEN.ensure(PCB,pkg,n)`로 `PCB.FP`에 등록.
- `src/app/partui.js`: `PL` 상태(IndexedDB `aod-parts`, API 설정 localStorage `aod.partapi`), `plIntent`(문장 → {ref,q}), `plReplaceFlow`(copAsk 카드로 진행: 찾기 → 없으면 Claude 추정/API/파일 → 후보 카드 → 핀 대응 → 짝 없는 핀·EN/전원 핀 질문 → 적용), `plApply`(보드 패드·실크·드릴 교체, 회로도 심볼 갱신 또는 `SCH.boxSym`으로 재생성, HSIS `hw` 참조 재매핑, PE 스택에 되돌리기 한 단계), 라이브러리 창 `openPartLib`(가져오기·템플릿·내보내기·승인·API 설정·조회 테스트), 데이터시트 탭 폴백 `plDsPage`.
- 콘솔: `replace <ref> [<MPN|설명>]`, `parts lib`; 회로·PCB·시스템 콘솔 모두 "…로 바꿔줘/교체/대신 써" 문장을 가로채 대화형으로 처리(AI 모드의 에이전트 명령 목록에서는 제외). `copSubmit`은 콘솔 자신의 스택이 안 바뀌면 다른 스택(PCB)의 변화를 변경 요청 카드로 올립니다. 카드 종류 `html` 추가.

## 멀티보드 시스템 — 보드 간 커넥터 연결 (v1.31)

- **시스템 = 보드 여러 장 + 연결(link)**. 머리글의 보드 선택 상자(`#mbSel`)로 보드를 오가고 `파일에서… / 신규 설계… / 예제` 로 보드를 **추가**합니다(첫 화면에서 여는 것은 시스템을 새로 시작). 보드마다 단계·NP·HSIS·모드 상태를 따로 보관(`mbSaveState/mbLoadState`).
- **시스템 연결** 워크스페이스(`setWorkspace('mb')`, 보드 2장 이상이면 탭 표시): 보드 목록(역할·열기·제거), 연결 추가 폼(A/B 보드·커넥터, 케이블/B2B, 매핑, 라벨), 연결별 핀 표(자동 매핑 `number`/`net`, `manual` 드롭다운), 점검 목록, 보드 연결도 SVG, 시스템 넷, 시스템 BOM, 내보내기(SVG·PNG·Excel).
- 코어 `src/core/multiboard.js`: `connectors(B)`(J*/CN*/P*/X* 또는 Connector 풋프린트), `mapPins(A,B,mode)`, `check` — `MISSING · PINCOUNT · NOPINS · UNMAPPED · OPEN · GND_MIX · RAIL · RAIL_SIG · NAME · DIFF · UNLINKED`, `systemNets`(union-find로 보드를 건너는 넷 합집합), `systemBom`(MPN/값/풋프린트로 합산, 보드별 수량), `svg`(연결도), `linksAoa`, `text`.
- 지표 띠 `시스템 연결` 타일(보드·연결 수, 오류·경고 → 탭으로 이동), 설계 보고서 `시스템 보드 연결` 항목, 설계 데이터 Excel에 `시스템 연결·BOM·넷·점검` 시트, 내보내기 창의 `보드 연결도 SVG/PNG`, `시스템 연결·BOM`.
- 리비전 스냅샷에 `mb`(이름·보드·역할·연결)가 들어가며 복원 시 같은 보드가 있으면 되살립니다. `revSig`에 연결 상태가 포함되어 변경 시 자동 리비전이 기록됩니다.

## 차세대 UI — 지표 띠 · 전체 보기 · 변경 요청 · 원장 · 분해 (v1.29)

다섯 시안(무한 캔버스 · 엔지니어링 콕핏 · 대화형 리뷰 스튜디오 · 설계 원장 · 제품 분해 뷰)에서 핵심을 섞어 넣었습니다.

- **지표 띠(콕핏)** — 머리 아래 한 줄: BOM 참고가(이름 붙인 마지막 리비전 대비 증감), 가이드라인 점수·미준수, DRC·미배선·층, HSIS 정상/전체, 최고 Tj(열 해석이 있으면 그 값, 없으면 하우징 추정), 하우징 무게·재질·IP·조건 만족. 상태색(정상·주의·오류)으로 표시되고, 타일을 누르면 그 자리로 갑니다(데이터시트 탭, 가이드라인 점검, DRC 목록, HSIS, 열 해석, 기구). 1단계·신규 설계에서는 시스템 블록·AI 확인 정보를 보여 줍니다. `src/app/nextui.js`의 `nxMetrics()`가 리비전 지문을 키로 캐시합니다.
- **전체 보기(무한 캔버스)** — 머리의 **전체** 버튼. 시스템 다이어그램 → 회로 → PCB → 기구 네 프레임이 "무엇이 무엇을 만들었는지" 화살표(회로 안, 층·전략, 재질·IP)로 이어지고, 프레임마다 그 단계의 그림(다이어그램·회로도 1장·TOP·조립도)과 요약 수치가 들어갑니다. 프레임을 누르면 그 단계로 가고, 아래 AI 바에 적으면 지금 단계 콘솔로 보냅니다. 오른쪽 도킹 패널은 그대로 유지됩니다.
- **변경 요청 카드(리뷰 스튜디오)** — 도우미에서 설계를 바꾼 실행마다 "유지/되돌리기" 대신 **변경 요청** 카드가 붙습니다: 시스템·회로(+추가 −삭제 값변경)·PCB·HSIS·기구·BOM(단가 증감) 영향 칩, 변경 요약, 실행한 명령 목록. **승인 · 리비전 기록**은 `CR-n` 이름으로 리비전을 남기고, **겹쳐 보기**는 마지막 리비전과 현재를 PCB 겹쳐 보기로 엽니다. 영향은 실행 전후 스냅샷을 `REVLOG.compare`로 비교해 셉니다.
- **원장(리비전 기록 창)** — **목록 | 원장** 전환. 가로 리비전(최근 14) × 세로 영역(시스템·계획, 회로, PCB, 기구, HSIS) 표에 직전 대비 바뀐 항목 수, 부품·넷·층, 원인이 들어갑니다. 열을 누르면 B, Shift+클릭은 A로 두고 아래에서 비교합니다. 이름 붙인 리비전은 밑줄로 표시됩니다.
- **기능 아이콘** — 모든 버튼·탭이 기능을 나타내는 한 벌의 선 아이콘(16격자, 1.6 px)을 갖습니다: 단계(블록·회로·보드·상자), 보기(3D 큐브·윗층·아랫층·회로), 파일(불러오기·내보내기·리비전), 도킹 탭(AI·정보·시뮬레이션·데이터시트), 정보·시뮬레이션·HSIS 탭, 2D 조작(화면 맞춤·편집·새 창·SVG/PNG), 기구(커버·zip·도면·BOM), 리비전 창, 변경 요청 카드, 지표 띠. `src/app/iconui.js`의 선택자 표가 정적·동적 버튼에 모두 붙이고(재렌더링 뒤에도 MutationObserver로 다시 붙임), 새 버튼은 표에 한 줄 더하면 됩니다.
- **기존 프로젝트도 단계별로** — 파일·예제로 연 보드(뷰어)에도 단계 표시줄이 보입니다. 1단계는 보드에서 추출한 HW 블록 다이어그램([보드에서 추출]로 편집 가능), 2단계 회로도, 3단계 PCB, 4단계 기구이며, 전체 보기와 지표 띠도 같습니다.
- **분해 보기·부품 띠(제품 뷰)** — 기구 CAD 오른쪽 패널의 **분해** 슬라이더로 커버를 들어 올리고(커버 열기 = 100), 그 아래 **부품(BOM 순)** 띠에서 HSG 품번을 누르면 3D의 해당 요소가 선택됩니다(베이스·커버·O-링 둘레·나사·보스·글랜드·벤트·페데스탈·커넥터 창; Shift로 여러 개). 선택 뒤에는 기존처럼 요청을 적어 AI에게 맡깁니다.

## 기구 BOM · 부품도 (v1.28)

- **기구 BOM** — 하우징을 이루는 부품을 품번별로 정리합니다: HSG-01 베이스 · HSG-02 커버(제작품: 재질·공정·외형·질량 추정·표면 처리·각인), HSG-10 O-링/개스킷(IP 등급별 규격, 분할면 둘레 길이, 홈 치수), HSG-20 커버 체결 나사(규격·길이·수량·체결 토크, 금속은 탭 / 수지는 HSG-21 열 압입 인서트), HSG-22 PCB 고정 나사, HSG-30 케이블 글랜드(크기별 수량·위치), HSG-31 ePTFE 벤트, HSG-40 방열 갭 패드/갭 필러(부품별 크기·두께 또는 도포량 g), HSG-50 방수 커넥터 플랜지 FIPG 실링, 장착 볼트(고객 측, 참고). 참고 단가(USD)는 초기 견적용 추정치입니다.
- **부품도** — HSG-01 베이스와 HSG-02 커버 각각: 평면도(베이스는 안쪽, 커버는 바깥 + 안쪽 요소 점선)에 구멍·형상 ID(B 보스, S 나사, P 페데스탈, T 장착 탭, F 사용자 형상), 단면 A–A(벽·바닥/윗판 두께, 높이, 보스, 방열 핀, O-링 홈), 구멍·형상 표(기준 A = 외곽 모서리에서 X·Y, 크기, 높이·깊이), 벽 개구 표(커넥터 창·글랜드·벤트를 높이로 베이스/커버에 나눔, 부품 높이를 벗어나면 표시), 주기(재질, 공정·빼기 구배, 표면, ISO 2768-m, 모서리 처리, 실링, 질량), 표제란(품번·품명·프로젝트·리비전·날짜). 기존 3면 도면은 **조립도**로 이름을 바꿨습니다.
- **설계 보고서**의 기구 섹션에 하우징 보고 → 기구 BOM → 조립도 → 부품도(베이스·커버) → 재질 비교 → 3D 순서로 들어갑니다. "설계 데이터 전체" Excel에 기구 BOM 시트가 더해집니다.
- 내보내기: 기구 CAD 오른쪽 패널의 **도면·BOM**(zip: 조립도·부품도 SVG+PNG, BOM CSV, SCAD) · **BOM Excel**, 내보내기 창의 부품도 SVG · 기구 BOM · 기구 도면 묶음.

## 리비전 기록 · 비교 (v1.27)

머리의 **리비전** 버튼(마지막 리비전 번호, 저장되지 않은 변경이 있으면 점 표시)으로 엽니다.

- **자동 기록** — 설계를 바꾸면(명령, AI 실행, 직접 편집, 회로 생성, 파일·예제 열기) 2–4초 뒤 리비전 `r1, r2, …`가 쌓입니다. 바뀐 게 없으면 기록하지 않습니다. 리비전마다 시각, 단계(1–4단계/뷰어), 원인(그 사이 실행한 명령), 직전 리비전과의 변경 요약(예: `동박 층 2→4 · 부품 +3 −1 · 넷 2개 · 배치 1개 이동`)이 남습니다. 창의 **자동 기록** 체크로 끕니다.
- **이름 붙인 리비전** — **지금 저장…**에서 이름(A01, EVT1…), 단계(Proto · EVT · DVT · PVT · MP), 메모(ECO 번호, 바뀐 이유)를 붙여 저장하거나, 기존 리비전에 [이름]으로 붙입니다. 이름 붙인 리비전은 정리 대상에서 빠집니다(자동 리비전은 프로젝트당 최근 150개 유지).
- **비교** — 목록에서 A·B를 고릅니다(“현재”도 고를 수 있음). 탭: 요약(크기·층·부품·넷·비아·트랙 길이 등 A/B/변화) · 부품(추가·삭제·값/풋프린트/부품 번호 변경) · 배치(Δx·Δy·회전·면) · 넷(새 넷·없어진 넷·연결 바뀐 넷, 핀별 넷 변경) · **PCB 겹쳐 보기**(층을 골라 같은 동박은 회색, A에만 있는 것은 빨강, B에만 있는 것은 초록, 비아·외곽 포함, 휠 확대·드래그 이동) · 다이어그램·계획(요구사항, HW 블록·연결, 회로 계획 블록) · HSIS(신호 추가·삭제·핀/넷 변경) · 기구(조건, 형상 지정값, 모서리, 추가 형상). **Excel**로 비교 결과를 시트별로 내려받습니다.
- **복원** — 리비전의 [복원]은 지금 상태를 먼저 리비전으로 남긴 뒤 보드·회로 계획·시스템 다이어그램·HSIS·하우징을 그 리비전으로 되돌리고, `rN 복원` 리비전을 남깁니다.
- **저장 위치 · Git** — 기록은 이 브라우저(IndexedDB, gzip)에 프로젝트별로 남아 새로고침해도 유지됩니다. **기록 내보내기**는 전체 이력을 JSON 파일 하나(`<프로젝트>_revisions.json`, `format: aod-revisions`)로 저장하므로 설계 파일과 함께 Git에 커밋할 수 있고, **불러오기**로 다른 PC에서 이어 봅니다(이미 기록이 있으면 뒤에 번호를 이어 붙이고 원래 번호를 `가져옴 rN`으로 표시).
- 설계 보고서와 "설계 데이터 전체" Excel에 리비전 기록 표가 들어갑니다.
- 스냅샷은 `src/core/revlog.js`: 보드는 패드·드릴이 서로 참조하는 객체 그래프라 같은 객체를 한 번만 쓰고 참조로 잇는 인코더로 저장하고, 복원 시 `PCB.finalize`로 넷·인덱스를 다시 만듭니다.

## 새 창의 층별·다이어그램·기구 보기 · 내보내기 (v1.26)

- **새 창(팝아웃) 보기 종류가 늘었습니다.** 칸의 보기 선택에 TOP · 내층(`L2/4 In1.Cu · GND 플레인 …`, 보드의 층 수만큼) · BOTTOM · 3D · 회로도 · **시스템 다이어그램 · 부품 구성도 · 기구 3D · 기구 도면** · HSIS · 시뮬레이션이 있습니다. 모두 메인 창과 연동되어 요구사항 분석, 기구 명령, 보드 변경이 바로 반영됩니다(기구 3D 칸이 있으면 메인에서 기구 CAD를 나가도 하우징이 유지됨).
- **기구 도면** — 하우징의 평면도(커버 위에서) · 정면도(앞 벽 S) · 우측면도(오른쪽 벽 E)를 치수(외형, 분할면 높이, 구멍 위치·높이)와 함께 SVG로 그립니다. PCB 보스·커버 나사·장착 탭·구멍·글랜드·각인·커넥터 창(빨간 표시)·분할면이 들어갑니다. `HOUSING.drawingSVG(R, name)`.
- **그림 내보내기(SVG · PNG)** — 머리의 **내보내기** 버튼, 보드 보기 위의 **SVG/PNG** 버튼, 새 창 칸마다의 **SVG/PNG** 버튼. 2D 보드(TOP · 내층 · BOTTOM)와 회로도는 화면을 그리는 캔버스 호출을 그대로 기록해 SVG로 쓰므로(`SvgCtx`) 화면과 똑같은 벡터가 나옵니다(클리핑·텍스트·점선 포함). 3D는 PNG로, 시스템 다이어그램·기구 도면은 SVG/PNG 둘 다. "모든 층 + 회로도 SVG (zip)"도 있습니다.
- **표 내보내기(Excel)** — HSIS 탭 머리의 **Excel** 버튼(지금 탭의 표), 새 창 HSIS·시뮬레이션 칸의 **Excel** 버튼, 내보내기 창의 HSIS 전체(신호 표·핀 맵·추적성·검사·핀 추천·MCAL·테스트 케이스를 시트별로) · BOM(수량·참조·부품 번호·참고 단가) · 부품 배치 · 넷리스트 · **설계 데이터 전체**(요약·BOM·배치·넷·층 구성·HSIS·하우징 형상). SheetJS를 못 불러오면 CSV로 내려받습니다.
- **설계 보고서(HTML → PDF)** — 내보내기 창에서 항목(개요·요구사항, 시스템 다이어그램, 회로·BOM·회로도, PCB 층별·층 구성·배치·넷, 3D, 시뮬레이션 결과, HSIS, 기구(하우징 보고·도면·3D), 설계 도우미 기록)을 골라 **HTML 파일 하나**로 저장하거나 바로 인쇄합니다. 그림(SVG·PNG)과 표가 모두 파일 안에 들어 있고, 맨 위 **[PDF로 저장]** 버튼이나 브라우저 인쇄의 "PDF로 저장"으로 PDF가 됩니다(A4 인쇄 CSS 포함).

## 다층 보드 층별 보기 · 기구 요소 선택 (v1.25)

- **동박 층별 보기** — 4층 이상 보드면 보기 탭(3D · TOP · BOTTOM) 옆에 **층 선택**이 나옵니다(`L2/4 In1.Cu · GND 플레인`처럼 층 번호·이름·역할 표시). 내층을 고르면 그 층의 동박(트랙·플레인)만 위에서 본 모습으로 그리고, 모든 층을 지나는 관통 패드·비아와 드릴을 함께 보여 줍니다. `[` `]` 키로 위·아래 층을 오갑니다. 내층 트랙·존을 눌러 넷을 강조할 수 있습니다.
  - KiCad `.kicad_pcb`의 `In1.Cu … In30.Cu` 트랙·호·채운 존을 이제 읽습니다(예전엔 버렸음). `power` 형식 내층은 플레인으로, 가장 큰 존의 넷을 플레인 넷으로 표시합니다.
  - Gerber 내층(`In1_Cu.gbr`, Protel `.G1`/`.G2`, `.GP1`, X2 `FileFunction,Copper,L2,Inr`)은 **Gerber · 내층 동박** 역할로 읽고 X2 층 번호나 파일 이름 번호 순서대로 In1, In2…에 놓습니다.
  - PCB CLI로 층을 늘린 보드(`board layers 4|6|8`)도 같은 방식으로 각 층을 봅니다.
- **기구 요소 선택 → AI 지시** — 기구 CAD 3D에서 요소를 클릭하거나 형상 트리에서 고릅니다. **Shift/Ctrl+클릭**으로 여러 개를 고르고, 빈 곳을 누르면 선택이 풀립니다. 선택한 요소는 주황색으로 표시되고, 위에 선택 막대(칩 · 요청 입력 · 적용)가 나옵니다.
  - 고를 수 있는 요소: 베이스·커버, 네 벽, 커버 윗면·바닥, 모서리(윗면 둘레·바닥 둘레·세로 모서리), 추가 형상(F1… 구멍·글랜드·사각 구멍·탭·리브·보스·핀·각인), 자동 요소(PCB 보스, 커버 나사, 방열 페데스탈, 커넥터 창, 자동 방열 핀).
  - 요청은 선택 막대나 도우미 입력창 어디에 적어도 선택과 함께 갑니다. **AI 모드**에선 Claude가 선택한 요소의 키·위치·쓸 명령을 받아 그 요소에만 적용합니다("이것", "여기" = 선택). **결정론 모드**는 규칙으로 바꿉니다: "지름 12로" → `edit F1 --d 12`, "위로 3mm" → `edit F2 --dz 3`(실제 높이로 환산), "왼쪽 벽으로 옮겨" → `--side W`, "M4로" → 탭 나사, "R3 둥근모따기" → 선택한 모서리, "삭제" → `del`, 벽을 고르고 "M16 글랜드 2개" → 그 벽에 추가.
  - 새 명령 `edit <F번호> [--d --w --h --u --z --du --dz --side --label --size | --screw --len --n --sides | --x --y | --pos --axis | --text --pitch]`: 이미 있는 형상을 지우지 않고 고칩니다.

## 첫 화면 · 단계 설계 · 디자인 뷰어 (v1.24)

앱을 열면 **첫 화면**이 나옵니다. 머리의 로고 아이콘으로 언제든 돌아올 수 있습니다.

- **신규 설계** — 요구사항부터 시작하는 단계 모드. 단계마다 그 단계에 필요한 것만 보입니다.
  - **1단계 시스템 다이어그램**: 프로젝트 이름과 요구사항을 적고 **블록 다이어그램 만들기**(또는 도우미에 문장을 바로 보내기)를 누르면 AI가 요구사항을 분석합니다. **빠진 필수 정보(입력 전원 · MCU 계열 · 통신 · 구동/센싱 · 환경/안전 등급)는 도우미에 응답형 질문 카드로 물어보고**, 선택지를 누르거나 직접 적어 답하면 요구사항에 `보강: …` 줄로 합쳐진 뒤 시스템 다이어그램을 그립니다(AI 모드에선 Claude가 질문을 고르고, 결정론 모드·AI 실패 시엔 규칙으로 묻습니다). 이 단계엔 PCB 조건 입력이 없고, 도킹 패널도 **설계 도우미** 탭만 있습니다(정보·시뮬레이션 없음).
  - **2단계 회로**: 다이어그램을 **세 가지 회로 안**(저가형 · 표준 · 확장형)으로 풀어 카드로 보여 줍니다. 각 안의 BOM 참고가(데이터시트 DB의 참고 단가 합, 약 1k 수량 추정), 부품 수, 여유 MCU 핀, 레귤레이터 손실, 가격·기능·확장성 점수와 기준 안과의 차이를 비교하고, 위의 **우선순위**(가격 · 균형 · 기능 · 확장성)로 추천이 바뀝니다. 안을 고르면 부품 · 넷리스트 · 회로도가 만들어지고 **회로도만** 보입니다 — 3D/TOP/BOTTOM, 레이어, 보드 요약 등 PCB 관련 화면은 3단계까지 나오지 않습니다. 도킹 패널에는 **데이터시트** 탭이 더해집니다. 도우미 명령: `variants [pick cost|std|ext]`, `generate [cost|std|ext]`.
  - **3단계 PCB** 부터는 기존과 같습니다(PCB 설계 시작 카드 → 배치·배선, 3D/TOP/BOTTOM, 정보·시뮬레이션).
- **기존 프로젝트** — 파일(KiCad · Gerber · 뷰어 JSON)이나 예제를 **디자인 뷰어**로 엽니다. 단계 표시줄 없이 3D/TOP/BOTTOM/회로도, 시뮬레이션, HSIS, PCB 편집을 모두 씁니다.

### 데이터시트 HTML DB

`datasheets/db/<부품번호>.html` — 부품 하나에 페이지 하나로, 실제 데이터시트를 보고 정리한 HTML입니다(형식은 `datasheets/db/README.md`). `<article data-mpn data-mfr data-cat data-price data-status>` 안에 핵심 사양 `<dl>`, 절대 최대 정격 · 권장 동작 조건 · 핀 배치 · 응용 회로 · 패키지 · 설계 메모 절을 둡니다. `npm run build`가 `scripts/dsdb.mjs`로 페이지를 `src/parts/dsdb.js`에 묶어 앱에 넣고 `datasheets/db/index.json`을 만듭니다. `npm run dsdb:init`은 부품 DB(`src/parts/parts.js`)에 있지만 페이지가 없는 부품의 초안(`data-status="stub"`)을 만들어 줍니다. 지금 29페이지는 모두 초안이며, 실제 데이터시트 내용으로 채우고 `done`으로 바꾸면 됩니다. `data-price`가 2단계 회로 안의 가격 비교와 데이터시트 탭의 BOM 참고가에 쓰입니다(없으면 분류별 기본 단가).

## 화면 구성 — AI 코파일럿 분할 (v1.23)

- **왼쪽: 작업 공간** — 단계마다 보드(3D·TOP·BOTTOM·회로도), 시스템 다이어그램, 하우징 CAD, HSIS가 들어갑니다. 1·4단계와 HSIS의 옆 패널은 도우미 패널과 나란히 놓일 때 한 열로 쌓여 캔버스 폭을 지킵니다.
- **오른쪽: 도킹 패널** — **설계 도우미 · 정보 · 시뮬레이션** 탭. 머리의 **도우미** 버튼(또는 패널의 `›`)으로 접고 펴며, 경계선을 끌어 너비를 바꿉니다.
- **설계 도우미** — 단계마다 따로 있던 콘솔(시스템 CLI · 회로도 CLI · 배치·배선 CLI · Text-to-CAD)을 하나의 대화로 합쳤습니다. 입력은 **지금 단계**의 콘솔로 가고(머리의 선택 상자로 단계를 고정할 수 있음), 출력에는 어느 단계에서 나온 것인지 표시됩니다. 사용자의 말은 말풍선, Claude·버튼이 실행한 명령은 명령 칩, 결과는 카드(긴 결과는 접힘)로 나옵니다. 설계를 바꾼 실행 뒤에는 **[유지] / [되돌리기]** 카드가 붙어, 그 실행이 더한 단계만큼 정확히 되돌립니다(그 뒤 다른 변경이 있으면 Ctrl+Z 안내). 빠른 요청 칩은 단계마다 바뀌고, 결정론 모드에선 명령을, AI 모드에선 문장을 보냅니다. `` ` `` 키로 어디서든 입력창으로 갑니다. 결정론/AI, 대화 방식(자동·질문·작업), 모델 등급, 토큰(추정)은 도우미 머리에 있습니다.
- **고정 패널을 새 창으로** — 설계 도우미, 정보·시뮬레이션(도킹 패널의 ↗), 레이어·보드 요약, 1단계 프로젝트/선택 패널, 4단계 조건/형상 트리, HSIS 문서/신호 상세(패널 오른쪽 위 ↗)를 각각 브라우저 새 창으로 뗄 수 있습니다. 패널 자체가 옮겨 가므로 메인 창과 그대로 연동됩니다(보드에서 부품을 고르면 새 창의 정보 패널이 바로 바뀌고, 새 창의 도우미로 보낸 명령이 메인 보드를 바꿈). 새 창을 닫거나 **메인 창으로**를 누르면 원래 자리로 돌아오고, 도우미와 정보 패널이 모두 떨어져 나가면 도킹 패널 자리는 작업 공간이 씁니다. 브라우저가 새 창을 막으면(예: 임베드된 화면) 화면 위에 떠 있는 창으로 열리며, 제목 줄로 옮기고 모서리로 크기를 바꿉니다.

**단계 게이트**: 앞 단계 산출물이 없으면 다음 단계 산출물을 보여 주지 않습니다. 회로가 없으면 2·3·4단계, PCB가 배치되지 않았으면 4단계가 잠깁니다(단계 표시줄에 흐리게 표시). 회로만 만든 보드를 3D/TOP로 열면 배치 대신 PCB 설계 시작 카드가 나옵니다.

HSIS(HW/SW 인터페이스 사양)는 단계와 별도인 보조 도구입니다. 핀 맵은 항상 MCU를 기준으로 그립니다: 핀 기능 데이터가 있거나 MCU로 보이는 부품을 커넥터·메모리보다 먼저 고르고, HSIS 문서가 없는 보드(새 설계·불러온 보드)에는 다른 예제의 HSIS 대신 그 보드의 MCU 핀과 넷으로 HSIS 초안을 만듭니다.

브라우저에서 PCB 설계 파일을 바로 열어 3D와 TOP/BOTTOM 2D로 살펴보고, 간단한 전기·열 시뮬레이션까지 돌려보는 단일 HTML 도구입니다. ASPICE HSIS를 회로도·SW 설정과 대조하는 작업 공간도 들어 있습니다. 파일은 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.

## 사용법

`dist/index.html`을 브라우저로 열고 **파일 불러오기**를 누르거나 파일을 끌어다 놓습니다. 3D 뷰(Three.js), zip 해제(JSZip), 엑셀 읽기(SheetJS)는 CDN에서 불러오므로 인터넷 연결이 필요합니다.

| 입력 | 표시되는 내용 |
|---|---|
| KiCad `.kicad_pcb` (v5–v10) | 동박·채워진 존·실크·외곽선·부품·핀 기능·넷 |
| KiCad `.kicad_sch` (v6 이상) | 회로도와 보드 연동 |
| Gerber RS-274X + Excellon (zip 가능) | 레이어 형상, 드릴. X2 속성이 있으면 넷·부품 |
| Pick-and-Place CSV/.pos | 부품 위치와 3D 바디 |
| BOM CSV | 값, 부품 번호, 설명 |
| IPC-D-356 | Gerber 패드·트랙의 넷 |
| 뷰어 JSON | 데이터 탭의 구조 참고 |

ODB++, IPC-2581, Altium/Eagle 원본 파일은 아직 읽지 못합니다.

## PCB 편집 (부품 배치 · 배선)

TOP/BOTTOM 보기에서 오른쪽 위 **PCB 편집**을 누르면 KiCad Pcbnew와 비슷한 도구로 보드를 고칩니다.

- **부품 배치**: 부품을 마우스로 끌어 옮기고(기준점이 격자에 맞춰짐), 고른 부품은 **방향키**로 격자만큼(Shift는 10배) 움직입니다. BOTTOM 보기에서는 화면 방향 그대로 움직입니다. **R** 회전 90°(Shift+R 반대), **F** 뒤집기(상단 ↔ 하단). 패드·드릴·실크스크린·부품 몸체·3D 모델이 함께 움직입니다. 격자 0.05–2.54 mm.
- **래츠네스트**: 넷마다 동박(트랙·비아·동박면)으로 이어진 묶음을 구하고, 아직 떨어진 묶음을 최소 신장 트리로 잇는 선을 실시간으로 보여 줍니다(끄는 중에도 갱신).
- **배선**: **X**로 시작할 패드·트랙을 누르고, 클릭할 때마다 직선 + 45° 꺾기로 트랙을 놓습니다(`/`로 꺾는 순서 바꾸기). 같은 넷 패드에 닿으면 끝나고, **V**는 비아를 넣고 다른 층으로 바꿉니다. 트랙 폭은 넷 종류별(신호 0.25, 전원 0.5 mm) 또는 직접 선택. **Del**로 트랙·비아 삭제, **Ctrl+Z / Ctrl+Y** 실행 취소·다시 실행.
- **DRC**: 다른 넷 동박 간격(0.15 mm)·단락, 구멍과 동박(0.25 mm), 부품 영역 겹침, 보드 밖·가장자리(0.3 mm)를 검사해 보드 위에 빨간 원으로 표시하고 목록에서 위치로 이동합니다. 예제 네 보드의 기존 단락·간격 문제를 고쳐 모두 DRC 0건입니다.
- **KiCad로 저장**: `.kicad_pcb`(KiCad 7 형식, 패드·넷·트랙·비아·동박면 외곽·실크·외곽선·고정 구멍)와 회로도 `.kicad_sch`, `.kicad_pro`를 zip 하나로 저장합니다. KiCad 7.0.11 `kicad-cli`로 열어 SVG·넷리스트를 뽑아 확인했습니다. 동박면은 외곽만 저장하므로 KiCad에서 채우기(B)를 다시 하세요.

## 보드 크기 · 회로도 기준 자동 배치 · CLI

PCB 편집 도구 막대의 **보드 W × H mm**, **회로도로 리셋·자동 배치**, **도우미**(또는 `` ` `` 키)로 씁니다. 명령은 오른쪽 설계 도우미(3단계 PCB)에 입력합니다. 버튼도 모두 같은 명령을 실행하므로 무엇을 했는지 도우미 대화에 남고, 한 번의 **Ctrl+Z**로 되돌립니다.

- **보드 크기**: 가로·세로·모서리 반지름을 바꿉니다. 왼쪽 아래 기준 또는 가운데 유지(부품·트랙을 함께 옮김). 모서리 근처 장착 구멍은 모서리를 따라가고, 동박면도 새 외곽에 맞춥니다. 사각형이 아닌 외곽은 비율로 늘립니다. 보드 밖으로 나간 부품을 알려 줍니다.
- **회로도로 리셋**: 트랙·비아·동박 영역을 지우고 넷리스트만 보고 처음부터 배치합니다. GND 동박면이 없으면 하단에 깝니다. 부품 역할(커넥터, MCU, 드라이버, 레귤레이터, 디커플링·벌크 캡, 크리스털, 발열·노이즈원·민감 부품)을 패키지·값·핀 기능·넷으로 판정한 뒤, 위치·90° 회전(옵션으로 하단 배치)을 담금질(simulated annealing)로 찾고 격자에 맞춰 겹침 없이 정리합니다.
- **배치 전략** (가중치만 다름)
  - `balanced` 균형: 배선 길이 · 디커플링 · 열 · 노이즈를 고르게
  - `thermal` 열 분산: 발열 부품(시뮬레이션 열 해석의 전력 사용)을 서로 멀리, 전해 캡·크리스털·아날로그 부품에서 떨어뜨림. 배선 시 노출 패드에 방열 비아
  - `noise` 노이즈 최소화: 디커플링 캡을 전원 핀 옆에, 스위칭 노드·DC-Link 루프를 짧게, 드라이버·FET를 MCU·크리스털·아날로그에서 멀리. 배선은 스위칭·전원 넷을 먼저, 하단 GND면을 덜 끊도록
  - `compact` 소형화: 배선 길이를 줄이고 가운데로 모음
  - 공통: 커넥터는 보드 가장자리(USB-C처럼 한쪽이 열린 커넥터는 열린 쪽이 가장자리로), 장착 구멍 피함, 넷 이름 라벨은 커넥터를 따라감
- **다층 기판**: `board layers 8`은 표준 스택업 S·GND·S·GND·PWR·S·GND·S(4층 S·GND·PWR·S, 6층 S·GND·S·PWR·GND·S, 10층도 지원)를 만듭니다. 내층 GND/전원 층은 플레인(넷 전면 동박)이 되고, 전원 플레인에는 핀이 가장 많은 로직 레일(+3V3 등, 모터·배터리 레일 제외, `--pwr 넷`으로 지정)이 들어갑니다. 플레인 넷의 기존 배선은 지우고 패드마다 비아로 플레인에 연결하며, 나머지 넷은 F.Cu · 내층 신호층 · B.Cu를 모두 써서 배선합니다(다층은 0.45/0.2 mm 비아 · 0.15 mm 간격). TOP 보기의 **내층 신호** 토글로 내층 트랙을 색으로 겹쳐 보고, 넷 정보에 층별 길이가, KiCad 저장에 In1.Cu…의 층·트랙·플레인 영역이 들어갑니다. `board stack`으로 층 구성과 유전체 두께를 봅니다. 열 해석은 외층 2장 + 써멀 비아 모델로 근사하고, 임피던스 해석의 기준면 거리는 내층 유전체 두께로 잡습니다.
- **보드 크기 최소화**: `board minimize`는 부품이 겹치지 않는 가장 작은 크기를 같은 가로세로 비율에서 촘촘한 쪽부터 찾아 다시 배치합니다(미세 피치 IC 주변에는 팬아웃 통로를 남김). `--route`면 그 크기에서 배선까지 해 보고, 미배선이 남으면 한 단계 큰 크기로 다시 시도해 가장 좋은 결과를 남깁니다(`--tries 3`). `--keep`(또는 `board fit`)은 지금 배치 그대로 외곽만 부품에 맞춥니다. 예: BLDC 컨트롤러 105 × 65 mm → 8층 56 × 35 mm(면적 71% 감소).
- **MCU 핀 재배정** `pinswap [--all] [--apply] [--route]`: 데이터시트 핀 기능이 맞는 핀 중 상대 부품에 가까운 핀을 추천하고, `--apply`면 보드 넷·회로도·HSIS를 함께 바꾸고 바뀐 넷의 배선을 지웁니다(한 번의 Ctrl+Z로 되돌림).
- **자동 배선**: 동박면·플레인 넷의 SMD 패드마다 비아 팬아웃(미세 피치 핀은 신호가 빠져나간 뒤) → 나머지 열린 넷을 격자 A*로 배선(IC 핀 앞 탈출 통로 예약, 미세 피치 핀으로 가는 전원선은 0.25 mm로 좁힘) → 막힌 넷은 근처 넷을 뜯어내고 다시 배선(rip-up & reroute, 결과가 나아질 때만 유지).
- **CLI 명령**: `help` · `status` · `board size 100 60 [--anchor center] [--corner 3]` · `board layers 8 [--pwr +3V3] [--route]` · `board stack` · `board minimize [--route] [--margin 1] [--keep]` · `pinswap [--apply]` · `strategies` · `reset --strategy thermal [--route] [--both]` · `place [--only U1,C3]` · `route [--signal 0.2 --power 0.3 --clear 0.2]` · `unroute` · `auto noise [--tries 3]`(리셋→배치→배선을 여러 시드로 돌려 가장 좋은 결과) · `lock U1` · `move U1 40 30 90` · `rotate` · `flip` · `drc` · `rats` · `report place|thermal|emc` · `undo` · `redo`. ↑↓ 이전 명령, Tab 자동 완성.
- **AI**: 명령이 아닌 문장(예: "열이 고르게 퍼지게 다시 배치하고 배선해줘", "보드를 8층기판으로 변경하고 사이즈를 최소화해줘")은 Claude가 위 명령을 도구로 골라 실행하고 결과 수치를 요약합니다(아티팩트에서 Claude 사용을 허용한 경우, 보는 사람의 사용량). 쓸 수 없으면 규칙으로 해석합니다(크기·층 수·최소화·리셋·전략·배선·리포트 낱말).
- 예제 결과(시드에 따라 다름): AURIX-364·MCU DC 모터는 보통 모든 넷이 배선되고 DRC 0건, BLDC·SENSE-32는 1–3개 넷이 남는 경우가 많아 `auto`가 시드를 바꿔 다시 시도합니다. 남은 넷은 직접 배선하거나 보드를 키우고 다시 실행하세요. 결과는 검토용 초안입니다(차동 쌍·길이 맞춤·임피던스 제어는 하지 않음).

## 새 회로 설계

머리의 **새 설계**로 엽니다. 프로젝트 이름과 요구사항(무엇을 만들지, 입력 전압, 쓸 부품)을 적고 **계획 세우기** → 블록을 고치고 → **회로 생성**하면 회로도·보드가 만들어져 뷰어에 열립니다. 결정론/AI는 다른 콘솔과 같은 스위치를 씁니다.

- **블록 라이브러리**(실제 부품): DC 전원 입력(커넥터 + SS14 역전압 보호 + SMAJ TVS + 벌크) · USB-C(5.1 kΩ CC, D+/D−) · LDO(AMS1117 3.3/5 V) · 벅 컨버터(TPS54331 + 10 µH SRN5040 + SS34 + 피드백·보상) · MCU(STM32F042K6U6 또는 AURIX TC364DP, 전원 핀 디커플링·리셋·부트·SWD/DAP 헤더) · 크리스털(20 MHz + 부하 캡) · CAN(TLE9251V, 스플릿 종단, PESD1CAN) · BLDC(DRV8313, 차지 펌프, VM 벌크, 홀 풀업·필터, 모터·홀 커넥터) · DC 모터(AO3400A, 게이트 R, 플라이백, 0.1 Ω 션트 + RC → ADC) · LED · 버튼 · SPI 플래시(W25Q32) · UART · I²C · 전압 감시
- **결정론 계획**: 요구사항 문장의 낱말(입력 전압, USB, BLDC/DC 모터, CAN, TC364, LED·버튼 개수, 플래시, UART, I²C, 전압 감시)로 블록을 고르고, 필요한 레일(CAN → 5 V, MCU → 3.3 V)을 LDO 단으로 만듭니다. 1단 LDO 손실이 0.7 W를 넘으면 벅 컨버터로 바꿉니다. 배치 전략도 정합니다(모터 → 열 분산, CAN·DC 모터 → 노이즈 최소화).
- **AI 계획**: Claude가 같은 명령(`add`·`set`·`remove`·`mcu`·`board`·`strategy`·`plan`)으로 블록을 고르고 경고(레일 없음, LDO 손실, 핀 부족)를 보며 고칩니다. 요구사항에 "생성"을 넣었을 때만 `generate`까지 실행합니다. 라이브러리에 없는 부품은 생성 후 회로도 CLI의 `add`로 더하라고 알려 줍니다.
- **MCU 핀 배정**: 블록이 요청한 역할(PWM·ADC·CAN·SPI·UART·I²C·USB·인터럽트·GPIO)을 MCU 핀 기능 DB로 배정합니다. 같은 주변장치(CAN TX/RX, SPI 3선, BLDC PWM 3개는 같은 타이머)로 묶고, SWD·크리스털·부트 핀은 비워 둡니다.
- **생성**(2단계): 부품 · 넷리스트 · 회로도를 만들고 회로 가이드라인 점검 결과를 표시합니다. 배치·배선은 하지 않습니다. 보드 크기 · 층 수 · 배치 전략 · 자동 배선 여부는 **PCB 조건**(`board 100 60 | auto | min`, `board layers 8`, `board route on|off`, `strategy`)으로 적어 두면 3단계 PCB 시작 카드에 채워집니다. 문장("8층으로, 크기 최소화")도 결정론 모드에서 이 명령으로 바뀝니다.
- **설계 CLI**: `plan` · `auto <요구사항>` · `blocks` · `add led --n 3 --color 빨강` · `set ldo2 vout 5` · `remove can6` · `mcu tc364` · `board 100 60 | auto | min` · `board layers 8` · `strategy noise` · `generate [--pcb]` · `undo`. 블록 카드에서 파라미터를 바로 고칠 수도 있습니다.
- 확인: 생성한 세 프로젝트(STM32 BLDC+CAN, TC364 CAN 노드, USB DC 모터)의 `.kicad_sch`를 KiCad 7 `kicad-cli`로 넷리스트를 뽑아 보드 넷과 비교해 모두 일치했습니다. 이 과정에서 KiCad 저장 시 넷 이름 라벨이 다른 넷의 교차점에 놓여 두 넷이 합쳐지던 문제를 고쳤습니다.

## 실행 방식 (결정론 / AI) · 설계 가이드라인

설계 도우미 머리에서 **결정론 / AI**를 고릅니다. 고른 방식은 모든 단계의 콘솔이 함께 쓰고 브라우저에 기억됩니다.

- **결정론**: 버튼·명령은 내장 알고리즘(담금질 배치, A* 배선, 규칙 점검)으로만 계산합니다. 문장은 낱말 규칙으로 명령으로 바꿉니다. Claude를 부르지 않습니다.
- **AI**: 문장과 빠른 버튼이 목표 문장으로 Claude에게 가고, Claude가 같은 명령을 도구로 골라 실행한 뒤 결과를 요약합니다. 모델 등급(빠름 · Haiku급 / 기본 · Sonnet급 / 고급 · Opus급)을 고릅니다. 명령어를 직접 치면 AI 모드에서도 그 명령만 실행합니다(`guide check`는 AI 검토가 붙음, `--det`로 끔).
- **대화 방식 (AI 모드)**: **자동**(기본) · **질문** · **작업**. 질문(QnA)은 설계를 바꾸지 않고 현재 상태와 조회 명령(`status` · `report` · `drc` · `rats` · `guide check` · `board stack` 등)만으로 답하고, 바꿀 일이 있으면 실행할 명령을 알려 줍니다. 작업(Agent)은 명령을 실행해 설계를 바꿉니다. 자동은 문장을 보고 고릅니다 — "왜 …?", "얼마나 …?", "설명/분석/검토해줘"는 질문, "…해줘/바꿔/추가" 같은 지시는 작업. 결정론 모드에서 질문을 치면 설계를 바꾸지 않고 상태만 보여 줍니다(예전에는 1단계 콘솔에서 질문이 새 아키텍처로 해석될 수 있었음). 모든 콘솔(시스템 다이어그램 · 회로도 · 배치·배선 · CAD)에 같은 스위치가 있습니다.
- **사용량 표시**: AI 실행마다 응답한 모델 등급(플랜 때문에 낮은 등급으로 바뀌면 그 사실), 라운드·명령 수, 입력·출력 토큰, 걸린 시간, 누적 사용량을 로그와 머리에 보여 줍니다. 아티팩트는 실제 토큰·크레딧 값을 받지 못하므로 토큰은 보낸·받은 글자로 **추정**한 값이고, 사용량은 보는 사람의 Claude 플랜 한도에서 차감됩니다.

**설계 가이드라인** (`guide`): PCB 12개 규칙(Datasheet 랜드 패턴·방열 패드·리턴 경로·Hot-loop·켈빈 션트·디커플링·Solid GND·TVS·차동 쌍·대전류 폭·3W·45°)과 회로 7개 규칙(IC 레일별 디커플링·레귤레이터 벌크 캡·크리스털 부하 캡·커넥터 TVS·CAN 종단·리셋 풀업·ERC)을 중요도(1–10)와 P0–P3 우선순위, 프리셋(표준 밸런스 · BLDC/인버터 · 전장 ECU · 고속 신호)으로 점검해 가중 준수율·최우선 미해결 건수·판정(우수/보통/위험)을 냅니다.
- 결정론 판정은 보드·회로도 데이터에서 계산합니다(예: 노출 패드 안 비아 수 대 권장 배열, 캡–전원 핀 거리, EMC Hot-loop 인덕턴스, 기준면 횡단, 커넥터 신호의 TVS, 차동 쌍 길이 차, 전원 트랙 폭, 3W 평행 구간, 직각 꺾임). 데이터로 정할 수 없는 부분(스텐실 개구율, 2단자 션트의 센스 인출 등)은 '수동 확인'으로 남깁니다.
- `guide set <규칙> pass|fail|na --note …`로 사람이나 AI가 판정하고(판정자 표시, `auto`로 되돌림), `guide preset motor`, `guide weight rt_3w 9`, `guide show <규칙>`, `guide check --all`(PCB+회로).
- AI 모드의 점검은 결정론 결과를 Claude가 검토해 근거가 있는 수동 항목만 판정하고, 개선 3가지를 실행할 명령과 함께 제안합니다(요청 없이 보드를 바꾸지 않음). 회로 점검은 빠진 부품을 `add C 100nF --pins +5V,GND --near U4` 같은 명령으로 제시합니다.

## 기구 CAD (보호 하우징 · Text-to-CAD)

상단 작업 공간 전환의 **기구 CAD**에서 보드를 감싸는 하우징을 설계합니다. 왼쪽은 설계 조건과 결과(카드·트레이드오프·경고), 가운데는 3D 보기와 **Text-to-CAD 콘솔**, 오른쪽은 형상 트리·치수·부품별 방열 경로·재질 비교·CAD 내보내기입니다.

**Text-to-CAD 콘솔** (`src/core/text2cad.js`)
- 명령: `set power|ip|vib|ta|tmax|tj|mat|tim <값|auto>` · `set wall|corner|stand|top|gap|split <mm|auto>` · `fillet|chamfer <top|bottom|vertical|all> <mm|off>` · `edit <F번호> --d|--w|--h|--u|--z|--side …` · `hole <면> --d <mm> [--u --z --n --pitch --label]` · `gland <면> [M16|M20|PG9…]` · `vent <면>` · `slot <면> --w --h` · `tabs <2|4|off> [--screw M5]` · `boss <x> <y>|center` · `rib x|y` · `fins <n> [--h]|off|auto` · `label "<글자>"` · `list` · `del <F번호|all>` · `reset` · `undo`/`redo` · `open`/`close` · `export zip|scad|stl` · `check` · `compare`. 면은 left right front back top bottom (W E S N T B), 벽 구멍의 `--u`는 벽 시작점에서의 거리, `--z`는 높이(보드 두께 중간면 = 0)입니다.
- 결정론 모드: 문장을 규칙으로 명령으로 바꿉니다. 예) "알루미늄 다이캐스팅으로 IP67, 진동 6G, 발열 18W" → `set mat adc12 → set ip IP67 → set vib 6 → set power 18`, "오른쪽 벽에 M16 케이블 글랜드 2개, 장착 탭 4개 M5, 커버에 "AURIX ECU" 각인" → `gland E M16 --n 2 → tabs 4 --screw M5 → label "AURIX ECU"`.
- AI 모드: Claude가 같은 명령을 도구로 하나씩 실행하고, 매 명령 뒤에 나오는 무게·온도·원가·경고를 보고 고칩니다. 내보내기는 사용자만 실행합니다. 모델 등급과 토큰(추정)을 표시합니다.
- 외곽 모서리 처리: `fillet`(둥근모따기 R) · `chamfer`(각모따기 C)를 커버 윗면 둘레(top), 바닥 둘레(bottom), 세로 모서리 4곳(vertical), 전부(all)에 줍니다. 문장도 됩니다 — "윗면 모서리 R3 둥근모따기" → `fillet top 3`, "바닥은 C1 모따기" → `chamfer bottom 1`, "네 모서리 라운드 5" → `fillet vertical 5`, 위치 없이 "둥근모따기 R2" → `fillet all 2`. ("모서리 R5"처럼 모따기 낱말이 없으면 예전처럼 세로 모서리 `set corner 5`.) 크기는 면에서 분할면까지 높이로 제한되며, 줄어들면 경고와 함께 실제 적용값(`적용된 모서리: 세로 R8 · 윗면 R4 · 바닥 C1.5`)을 출력합니다. R이 벽 두께보다 크면 안쪽도 같은 중심으로 둥글어집니다. 3D 보기(벽·모서리 조각·둘레 띠)와 SCAD(층별로 줄인 윤곽의 hull)에 모두 반영됩니다.
- 명령마다 결과 한 줄(재질 · 외형 · 무게 · PCB 온도 · 최고 Tj · 원가 · 조건 만족 여부)과 새 경고를 보여 주고, 실행 취소할 수 있습니다.
- 형상 점검: 커넥터 창과 겹침, 분할면을 가로지르는 구멍, 모서리·벽 높이 밖, 커버/바닥 구멍과 방열 페데스탈 겹침, IP54 이상에서 막지 않은 구멍(글랜드·벤트·플러그 필요)을 경고합니다.
- 내보내기: SCAD에 구멍·사각 구멍·글랜드·벤트·장착 탭·리브·각인·모서리 R이 실제 CSG로 들어가고(OpenSCAD 렌더링 확인), 보고서에 Text-to-CAD 명령 기록이 남습니다.
- PCB CLI의 `housing` 명령은 계산·비교만 하고, `housing show`는 기구 CAD 작업 공간을 엽니다.

**하우징 계산** (`src/core/housing.js`)

- 입력: 발열(W, 기본은 보드 부품 손실 합), 방수·방진 등급(IP54/65/67/69K), 진동(Grms), 주변 온도, PCB 한계 온도, 부품 Tj 한계, 재질(자동 또는 지정), 방열 패드(TIM, 자동 또는 지정).
- 후보 재질 6종(PC/ABS, PA66-GF30, SPCC 판금, A6063 압출, ADC12 다이캐스트, AZ91D 마그네슘)을 모두 계산하고, PCB 온도·부품 Tj·IP·진동 조건을 만족하는 것 중 가장 싼 것을 고릅니다.
- 부품별 방열 경로: 노출 패드·탭이 있는 부품은 패드와 주변 구리에 서멀 비아(Ø0.3, 1 mm 피치, 충전·캡핑) → TIM → 베이스 페데스탈, 없는 부품은 패키지 윗면 → TIM → 커버 페데스탈. TIM은 갭 패드 1.5/3.0/6.0 W/m·K와 디스펜싱 갭 필러 4.0 W/m·K 중 Tj 한계(여유 10 °C)를 맞추는 가장 싼 것을 고르고, 공차로 정한 BLT(윗면 0.8 mm, 아래 0.4 mm 이상)와 패드 두께(압축률 반영)를 냅니다. 보드만으로 충분히 식는 부품에는 페데스탈을 두지 않습니다. 방열 패드 넷이 접지가 아니면 절연형 TIM 경고를 냅니다.
- 방수 커넥터 관통부(예: AURIX 예제의 JAE MX23A12NF1): 슈라우드가 벽의 창(슈라우드 + 0.3 mm)을 지나고, 헤더 플랜지가 내벽에 FIPG/실리콘 패킹으로 실링됩니다. 그 쪽 벽은 플랜지 면에 맞춰 놓이고, 하우징 분할면은 창 아래로 내려가 창이 커버 안에 온전히 들어갑니다. 실링 폭, 슈라우드 돌출 길이, 하네스 플러그(MX23A12SF1) 착탈 공간도 확인합니다.
- 결과 카드: 재질·벽 두께, 방열 방식, 방열 패드(TIM) 선정, 커넥터 관통부·실링, 밀봉(가스켓/O-링·FIPG, 통기 벤트), 고정(스크루 보스 개수·규격·피치, PCB 지지점).
- 트레이드오프 막대: 비용, 무게, 열 여유, 진동 안전율. 부품별 방열 경로 표(경로·TIM·BLT·비아 수·K/W·Tj), 후보 비교표와 경고도 표시합니다.
- 진동: Steinberg 식으로 PCB 1차 고유진동수와 처짐을 구하고, 안전율 2 미만이면 가운데 지지점을 추가합니다.
- 3D 보기에 하우징(베이스·커버)을 겹쳐 보여주고 커버를 열 수 있습니다. 커넥터 위치에 개구부가 뚫리고, 방수 커넥터는 창 둘레 실링선과 결합 플러그 외형을 함께 그립니다. 페데스탈과 TIM(분홍)은 베이스·커버에 각각 붙습니다.
- 내보내기(zip): OpenSCAD 모델(.scad, 베이스·커버 페데스탈과 커넥터 창 포함), 베이스·커버 STL(참고용), 보고서(.md), 결과 JSON(부품별 방열 경로·TIM·비아·Tj).
- PCB CLI `housing check|compare|show|hide|open|close|export --p 18 --ip 67 --vib 6 --ta 40 --tmax 85 --tj 125 --mat adc12 --tim auto|pad15|pad30|gel40|pad60|none`. AI 모드에서는 계산 결과를 바탕으로 AI가 검토 의견을 덧붙입니다.

수치는 초기 설계용 근사입니다. 양산 설계 전에는 CFD·FEA와 시험으로 확인해야 합니다.

## 회로도 CLI · AI

2단계(전체 회로도 보기)에서 설계 도우미에 입력하면 회로도 콘솔로 갑니다(회로 편집 도구 막대의 **도우미** 또는 `` ` `` 키). 명령마다 회로도 실행 취소 한 단계이고, 보드는 `apply`(F8과 같음)를 해야 바뀝니다.

- 조회: `status` · `pages` · `page 2` · `parts U` · `pins U4 [--free] [--net +5V]` · `nets CAN` · `net +3V3` · `find C14`
- 편집: `add C 100nF --pins +5V,GND --near U4`(전원·GND 캡은 전원을 위로 세워 놓고, 핀 끝에 짧은 배선과 전원 심볼·넷 라벨을 붙임) · `connect U4.8 CAN_STB`(핀 이름도 됨: `U1.VEXT`) · `disconnect U4.8` · `nc U1.55` · `value R5 47k` · `fp C14 0402` · `rename` · `move` · `rotate` · `mirror` · `delete`
- 검사·반영: `erc` · `diff`(보드와 다른 점) · `apply` · `regen`(보드 넷리스트로 다시 생성) · `export`
- **AI**: "U4 전원 핀마다 100nF 디커플링 캡 달아줘", "CAN_STB에 4.7k 풀업 추가하고 보드에 반영해" 같은 문장은 Claude가 먼저 `pins`·`net`으로 실제 핀 번호와 넷 이름을 확인한 뒤 명령을 실행하고, `erc` 결과까지 요약합니다. `regen`처럼 편집을 버리는 명령은 사용자가 요청했을 때만 실행합니다. Claude를 쓸 수 없으면 ERC·반영·다른 점·상태 같은 낱말만 규칙으로 해석합니다.

## 회로도

보기 전환의 **회로도**로 회로도를 보고, **나란히**를 누르면 회로도와 보드(3D·TOP·BOTTOM)를 함께 봅니다. 한쪽에서 부품이나 넷을 고르면 다른 쪽에서도 같이 강조되고, 그 위치로 이동합니다(크로스 프로빙).

- **KiCad 회로도**: `.kicad_sch`(KiCad 6 이상)를 보드와 함께 불러오거나, 회로도 보기의 **회로도 불러오기**로 열린 보드에 붙입니다. 계층 시트는 시트 탭으로 나뉘고, 심볼 핀을 보드 패드에 맞춰 넷을 연결합니다.
- **자동 생성 회로도**: 회로도 파일이 없으면 보드 넷리스트로 **배선이 그려진** 회로도를 만듭니다.
  - **기능별 페이지**: IC·커넥터를 중심으로 수동 소자를 묶은 블록을 전원 · MCU · 모터 드라이버 · 통신 · 메모리 페이지로 나누고, 신호를 많이 주고받는 블록끼리는 A4 한 장에 들어가는 한 같은 페이지에 모읍니다. 큰 IC(64핀 초과)의 미사용 핀은 별도 "미사용 핀" 페이지에 NC 표시로 모읍니다.
  - **신호 흐름 배치**: 페이지의 중심 블록(MCU 등) 좌우로 연결된 블록을 열로 놓고, 마주 보는 핀 순서를 상대 핀 순서에 맞춰 배선이 꼬이지 않게 합니다. 풀업·직렬 저항·필터 캡은 연결된 핀 옆에 붙이고, 디커플링 캡은 블록 아래 줄에 둡니다.
  - **배선**: 같은 페이지 안의 신호 넷은 1.27 mm 격자 위 직교 배선(A* 미로 라우터)으로 핀과 핀을 잇습니다. 다른 넷과는 직각 교차만 허용하고, T 분기에는 접속점을 찍습니다. 전원 페이지에서는 레귤레이터 입·출력 레일도 배선으로 잇습니다.
  - **전원·접지**: IC 전원 핀은 위, 접지 핀은 아래에 두고 같은 레일 핀을 짧은 선으로 묶어 전원/접지 심볼 하나로 표시합니다.
  - **페이지 간 연결**: 다른 페이지로 이어지는 넷은 글로벌 라벨과 상대 페이지 번호 `[2]`로, 한 핀에만 붙은 넷은 넷 이름 라벨로 표시합니다.
- **회로 편집**: 회로도 보기의 **회로 편집**을 누르면 KiCad Eeschema와 같은 도구·단축키로 회로도를 고칩니다. 자동 생성 회로도와 불러온 `.kicad_sch` 모두 편집할 수 있고, 편집한 회로도는 보드와 함께 유지됩니다.
  - 도구: 선택(Esc) · 이동 M(연결 끊김) · 끌기 G(연결 유지) · 배선 W(`/`로 꺾는 방향, 핀·배선에 닿으면 끝) · 넷 라벨 L · 글로벌 라벨 Ctrl+L · 전원 심볼 P · 부품 추가 A(R·C·전해 C·L·FB·D·LED, 또는 회로도에 없는 보드 부품) · NC Q · 삭제 Del. 동작: 회전 R · 좌우 반전 X · 상하 반전 Y · 속성 E(참조·값·풋프린트) · 실행 취소 Ctrl+Z · 다시 실행 Ctrl+Y. 마우스로 부품을 끌면 G와 같이 배선이 따라옵니다.
  - 1.27 mm 격자에 맞추고, 끌기·회전·반전 때 핀에 붙은 배선은 다른 넷의 배선·핀·라벨에 닿지 않는 경로(한 번 또는 두 번 꺾기)로 다시 잇고, 핀 위의 전원 심볼·라벨·NC는 함께 옮깁니다. T 분기에는 접속점이 자동으로 찍힙니다.
  - **ERC**: 연결되지 않은 핀, 끝이 떠 있는 배선, 핀이 없는 라벨을 표시합니다.
  - **보드에 반영 (F8)**: Eeschema의 *Update PCB from Schematic*처럼 회로도 연결로 넷리스트를 만들어(라벨·전원 이름 → 보드의 기존 넷 이름 → `Net-(REF-PadN)`) 바뀐 핀 넷·값·새 부품을 목록으로 보여 주고 적용합니다. 새 부품은 풋프린트로 만들어 보드의 빈 자리(부품·구멍·다른 넷 동박이 없는 곳)에 놓고, 트랙·비아는 그대로 둡니다.
  - **.kicad_sch 저장**: KiCad 7 형식(버전 20230121, KiCad 7–10에서 열림)으로 저장합니다. 여러 페이지는 루트 시트 + 하위 시트 묶음(zip)이고, 큰 IC의 미사용 핀 페이지는 같은 부품의 다른 유닛, 배선만으로 이어진 넷에는 보드 넷 이름 라벨을 붙여 넷 이름을 유지합니다. 예제 세 보드는 KiCad 7.0.11 `kicad-cli`로 넷리스트를 뽑아 보드 넷과 핀 단위로 같은 것을 확인했습니다.
- HSIS 신호 상세에서 **회로도** 버튼을 누르면 해당 넷을 강조한 회로도로 이동합니다.

## 창 나누기와 새 창

- **크기 조절**: 왼쪽·오른쪽 패널 경계, 회로도와 보드 사이 경계, HSIS 패널 경계를 마우스로 끌어 크기를 바꿉니다. 경계를 더블클릭하면 기본값으로 돌아가고, 키보드 화살표(Shift로 크게)로도 조절할 수 있습니다. 크기는 브라우저에 저장됩니다.
- **새 창 (여러 보기 배치)**: 헤더의 **새 창** 버튼을 누르면 레이아웃 고르개가 열립니다.
  - 자주 쓰는 배치 **1×1 · 1×2 · 1×4 · 2×2** 버튼, 또는 표 삽입처럼 마우스를 올려 **최대 2행 × 4열**까지 칸 수를 고릅니다(방향키로도 이동).
  - 칸마다 **TOP · BOTTOM · 3D · 회로도**, 그리고 **HSIS 신호 표 · 핀 맵 · 추적성 · 검사 결과 · 신호 상세** 중 원하는 보기를 지정하고 **새 창 열기**를 누릅니다. 마지막 선택은 배치별로 기억됩니다.
  - **시뮬레이션 칸**(전압 강하 · 신호 무결성 · 열 분포 · 회로 동작)은 원래 창의 시뮬레이션 패널과 같은 설정·결과를 공유합니다. 칸에서 바로 계산을 실행할 수 있고, 기판 조건(동박 두께·유전체 등)은 원래 창 패널에서 바꿉니다.
  - TOP·BOTTOM 칸 머리의 **겹치기** 목록으로 시뮬레이션 결과를 보드 위에 겹칩니다. **자동**이면 같은 창의 첫 시뮬레이션 칸 결과(없으면 원래 창 시뮬레이션 패널의 탭)를 따르고, 범례와 마우스 값 표시가 칸 안에 나옵니다. 3D 칸의 겹치기는 원래 창 설정을 따릅니다.
  - HSIS 칸에서 신호(표 행, 핀 맵의 핀, 검사·추적성 칩)를 고르면 그 신호의 넷이 같은 창의 보드·회로도 칸과 원래 창에서 강조되고, 신호 상세 칸이 함께 바뀝니다. 반대로 보드·회로도에서 넷을 고르면 HSIS 신호 표에서 해당 행이 표시됩니다. HSIS 작업 공간의 필터와 선택도 새 창 HSIS 칸에 그대로 반영됩니다.
  - 새 창 안에서도 상단의 레이아웃 버튼으로 배치를 바꾸고, 칸 머리의 목록으로 보기를 바꿀 수 있습니다. 칸 사이 경계선을 끌면 행·열 크기가 바뀌고(더블클릭하면 균등), **모두 맞춤**으로 모든 칸을 다시 맞춥니다.
  - 3D 칸은 칸마다 카메라가 따로 있어 회전·이동·확대를 독립적으로 할 수 있고, 등각·위·아래 버튼을 제공합니다.
  - 어느 칸에서 부품·넷을 클릭해도 원래 창과 다른 모든 칸에 선택과 강조가 실시간으로 연동됩니다.
  - 보드 위 **새 창** 버튼과 회로도의 **새 창** 버튼은 현재 보기 한 칸(1×1)짜리 창을 바로 엽니다. 브라우저가 팝업을 막으면 화면 안에 떠 있는 창으로 열리며, 제목 줄로 옮기고 모서리로 크기를 조절합니다.

## 시뮬레이션

오른쪽 패널의 **시뮬레이션** 탭에서 실행합니다. 설계 초기 검토용 근사 계산입니다.

- **전원 경로**: 트랙·비아 저항망을 풀어 부하 핀 전압 강하, 배선 손실, IPC-2221 트랙 온도 상승을 계산합니다.
- **신호**: Hammerstad 마이크로스트립 식으로 특성 임피던스와 지연, 차동쌍 길이 차·스큐·차동 임피던스를 구합니다.
- **열**: 보드를 얇은 판으로 보고 FR-4·동박 면방향 전도와 양면 대류로 정상 상태 온도 분포를 풉니다.
- **EMC**: 레이아웃 기생 성분으로 모터 제어기 EMC/EMI 핵심 파라미터를 추정하고 판정합니다 (아래).
- **회로**: 넷리스트와 부품 값으로 MNA(수정 절점 해석) DC·과도 해석을 합니다. IC는 레귤레이터/정전류 부하 모델로 대체합니다. **N채널 MOSFET**(Level-1)과 **브러시 DC 모터**(권선 R·L·역기전력 + 회전자 관성·점성/쿨롱 마찰·부하 토크·기어비의 전기-기계 모델)를 지원하며, 모터 속도와 회전각을 시간에 따라 적분합니다. 크리스털·BJT·디지털 동작은 모델링하지 않습니다.

### 열 해석 (PCB 열해석 절차 반영)

시뮬레이션 패널의 **열** 탭은 PCB 열해석 표준 절차(① 적층 → ② 발열원 → ③ 경계 조건 → ④ 메싱·솔빙 → ⑤ Tj·핫스팟)를 위쪽 단계 표시로 보여 주고, 열해석 4대 파라미터 묶음으로 입력을 나눕니다.

- **① PCB 구조·재질**: 상·하 동박 두께(0.5/1/2/3 oz), 비아 도금 두께, FR-4 k<sub>z</sub>. 보드는 상단·하단 동박층 두 장(면방향: 구리 390 W/m·K × 두께 × 피복률 + FR-4 k<sub>xy</sub>)을 FR-4 수직 전도와 **써멀 비아**(보드의 비아·도금 홀마다 구리 배럴 전도)로 잇는 2층 판으로 풉니다.
- **② 부품 발열·열저항**: 부품별 P, θ<sub>JB</sub>, T<sub>j,max</sub>. 데이터시트 값이 있는 부품은 그 값을 씁니다(DRV8313 PWP θ<sub>JB</sub> 5.6 °C/W·T<sub>J</sub> 150 °C, AMS1117 θ<sub>JC</sub>(탭) 15 °C/W·125 °C, STM32F042 온도 등급 6 T<sub>J</sub> 105 °C). 나머지는 패키지 일반값(추정)이며 출처가 표시됩니다. 부품의 리드프레임·노출 패드가 발자국 안에서 열을 퍼뜨리도록 모델링합니다.
- **③ 방열 부자재·기구물**: "상부"를 체크한 부품은 θ<sub>JC</sub> → TIM(열전도율, 압축 두께 BLT) → 하우징 벽(ADC12·A6063·AZ91D·PC/ABS) → 하우징 표면 대류·복사의 두 번째 경로를 가지며, 정션 노드를 연립해 보드/하우징으로 나뉘는 열을 정확히 풉니다.
- **④ 환경·경계 조건**: 주변 온도 프리셋(25 상온 / 65 산업 / 85 차량 실내 / 105·125 엔진룸), 자연 대류(수직·수평 장착) 또는 강제 대류(풍속 → h), 방사율 ε(솔더마스크·흑색·무처리 금속)로 선형화 복사, **줄 히팅** I²R(넷 전류 입력 또는 전압 강하 해석의 트랙별 전류, 구리 저항 온도계수 0.00393 /°C 반영).
- **⑤ 결과**: 부품별 T<sub>j</sub>와 마진(T<sub>j,max</sub> − T<sub>j</sub>: 15 °C 이상 정상 · 0–15 주의 · 음수 초과), 보드 최고 온도, 대류/복사 방열 비율, 상·하단 층별 열 지도, 부품별 온도 상승 누적(확산·대류 / 수직(FR-4·비아) / 패키지), 써멀 비아 개수에 따른 T<sub>j</sub> 곡선(현재 해석값에 맞춘 집중 상수 근사), **실측 보정**(측정 T<sub>top</sub> + Ψ<sub>JT</sub>·P로 T<sub>j</sub> 역산, 해석 대비 오차).
- 초기 설계 탐색용 근사이며 양산 검증은 3D CFD/FEA와 IR 카메라·열전대 실측 보정을 병행해야 합니다 (JEDEC JESD51 · IPC-2152 · IPC-2221). AURIX TC364 예제는 12 V → 5 V 선형 레귤레이터 U2(0.84 W)가 핫스팟이며, 85 °C 환경에서는 T<sub>j,max</sub>를 넘고 다이캐스팅 하우징 상부 방열을 켜면 마진이 회복되는 것을 볼 수 있습니다.

### EMC/EMI 해석 (모터 제어기 파라미터)

시뮬레이션 패널의 **EMC** 탭은 모터 제어기 PCB의 EMC 4대 파라미터 묶음을 레이아웃에서 바로 추정하고, 맨 위에 요약 체크포인트 3가지(**L<sub>loop</sub> 최소화 · C<sub>p,heatsink</sub> 관리 · 켈빈 소스·고주파 ESL**)를 카드로 보여 줍니다. 판정 항목을 누르면 해당 경로(스위칭 노드, 커뮤테이션 루프, 크로스토크 쌍, 게이트 넷, ESL이 큰 캡, 기준면 슬롯 ✕)가 보드 위에 강조됩니다.

- **① 파워 스테이지**: VM·OUT 핀을 가진 드라이버(DRV8313 등)를 찾아 DC-Link 캡(VM–GND)마다 커뮤테이션 루프 인덕턴스 L<sub>loop</sub> = 배선(기준면 위 마이크로스트립 Z₀·지연) + 비아 0.2·h·(ln(4h/d)+1) + 캡 ESL(패키지별) + 패키지를 계산합니다. 턴오프 스파이크 ΔV = L·dI/dt, 바디 다이오드 역회복(I<sub>rr</sub> ≈ 2Q<sub>rr</sub>/t<sub>rr</sub>), 피크 전압 대 절대 최대 정격(부품 DB), 링잉 주파수 1/2π√(L·C<sub>oss</sub>)가 30–200 MHz 방사 대역에 드는지 봅니다. 개별 FET는 게이트 루프 L<sub>gate</sub>와 공통 소스 인덕턴스 L<sub>CSI</sub>(션트 공유 여부), 그라운드 바운스 L<sub>CSI</sub>·dI/dt를 냅니다.
- **② 스위칭 스펙트럼**: 사다리꼴 포락선(평탄 → 1/πτ부터 −20 dB/dec → 1/πt<sub>r</sub>부터 −40 dB/dec)으로 스위칭 노드 전압을 150 kHz–1 GHz에 그리고, 전도(LISN 25 Ω 공통 모드), 하네스 공통 모드 방사(Ott: E ≈ 1.257×10⁻⁶·f·L·I<sub>cm</sub>/r), 루프 차동 모드 방사(E ≈ 1.316×10⁻¹⁴·f²·A·I/r)를 추정합니다. t<sub>r</sub> 배수 비교와 사용자 한도선을 지원합니다(규격 한도는 넣지 않음). 스위칭 주파수는 HSIS PWM 타이밍에서 가져옵니다.
- **③ 크로스토크**: 가해선(상 출력 V<sub>bus</sub>/t<sub>r</sub>, PWM 제어선)과 같은 층 5 mm 이내로 나란한 피해선(HSIS 분류·넷 이름으로 아날로그/통신/디지털 입력)을 찾아 영상법으로 C<sub>m</sub>·L<sub>m</sub>을 구하고 유기 노이즈 C<sub>m</sub>·dV/dt·Z + L<sub>m</sub>·dI/dt를 허용치(ADC 4 LSB, 통신 0.2 V, VIL 30 %)와 비교합니다.
- **④ 수동 소자 기생**: 디커플링 캡마다 ESL + 실장 인덕턴스(GND 비아까지 인출선 + 비아)로 자기공진 f<sub>SRF</sub>와 100 MHz |Z|, VM 고주파 바이패스 MLCC 유무, EMI 필터(L/FB/CMC) 유무.
- **⑤ 시스템 결합**: 스위칭 노드 동박 면적과 TIM 두께·ε<sub>r</sub>·방열판 위치로 C<sub>p,heatsink</sub> = ε₀ε<sub>r</sub>A/d와 I<sub>cm</sub> = C<sub>p</sub>·dV/dt, GND 기준면을 끊는 반대층 트랙 위를 지나는 신호(슬롯 교차), 신호 리턴 루프 면적, 하네스 길이·실드 감쇠·측정 거리.
- 레이아웃 기하와 일반 패키지 값에 기반한 1차 추정(pre-compliance)입니다. t<sub>r</sub>/t<sub>f</sub>·C<sub>oss</sub>·Q<sub>rr</sub>·t<sub>rr</sub>는 데이터시트·실측 값을 넣어야 정확하며, 최종 판정은 3D 전자기 해석과 챔버 시험으로 확인해야 합니다. AURIX TC364 예제에서는 DC-Link 캡 C12가 DRV8313 VM 핀에서 16.5 mm 떨어져 L<sub>loop</sub> ≈ 15 nH, 링잉 ≈ 75 MHz(방사 대역), VM에 고주파 바이패스 MLCC가 없는 것이 드러납니다. 알루미늄 전해 C13(470 µF)은 저주파 리플 전류를 맡지만 ESL ≈ 6 nH·ESR 80 mΩ이라 루프 인덕턴스가 21.6 nH로 더 커서, 고주파 바이패스는 MLCC가 맡아야 한다는 점을 비교할 수 있습니다.

### 3D 재생 (LED 점등 · 모터 회전)

- 회로 해석 결과가 있으면 3D 보기에서 **LED가 흐르는 전류만큼 빛나고**(빛 번짐 포함), **DC 모터 출력축의 팬이 계산된 회전각대로 돕니다.**
- 과도 해석 후에는 3D 아래쪽 **재생 막대**로 재생/일시 정지, 시간 이동, 재생 속도(3·6·12·30초에 재생, 실제 속도)를 고릅니다. 모터 rpm·전류와 LED 전류가 함께 표시됩니다. 빠른 PWM은 화면 한 프레임 동안의 평균 전류로 밝기를 정해 실제 눈에 보이는 밝기처럼 보여줍니다.
- DC 동작점 결과는 정상 상태 밝기와 일정 속도 회전으로 보여줍니다. 회로 동작 패널의 **3D에서 재생/3D에서 보기** 버튼이나 펌웨어 편집기의 **3D에서 보기**으로 바로 이동합니다. 새 창의 3D 칸도 함께 움직입니다.

### 예제: MCU DC 모터 (MOTION-32 DEV)

파일 불러오기 창의 **예제: MCU DC 모터** 버튼(또는 왼쪽 패널의 예제 전환 버튼)으로 엽니다. DC 모터·LED·MCU를 한 보드에 담았습니다.

- **회로**: J1(Würth 61300211121) 5 V → AMS1117-3.3 LDO(U2) → STM32F042K6U6(U1, UFQFPN32). U1 **PA8(TIM1_CH1) PWM** → R1 → AO3400A(Q1) 로우사이드 스위치 → Mabuchi FA-130RA 모터(M1, Tamiya 70097 기어 1:58 팬), Vishay SS14 플라이백(D1). Q1 소스의 0.1 Ω 션트(R5, Yageo RL1206) 전압을 R6·C4 RC 필터로 평균내 **PB1(ADC_IN9)**로 읽습니다. LED는 Kingbright APT1608 시리즈로 전원(D2), 상태(D3, **PA4** GPIO), 구동 표시(D4) 세 개입니다.
- **펌웨어**: U1을 클릭하면 정보 패널에 **주요 파라미터**(PWM 주파수, 목표 듀티, 기동 지연, 소프트 스타트 시간, 전류 제한, LED 점멸 주기)가 나타나 바로 바꿀 수 있고, **코드 편집**으로 펌웨어 전체를 고칠 수 있습니다. 코드는 JavaScript 문법의 Arduino 스타일 API(`pinMode`, `digitalWrite`, `pwmInit`, `pwmWrite`, `analogRead`, `analogReadVoltage`, `millis`, `log`)를 씁니다. 코드 위쪽의 `const 이름 = 숫자; // 설명` 상수가 자동으로 파라미터 슬라이더가 됩니다.
- **코시뮬레이션**: **빌드 & 시뮬레이션**을 누르면 `setup()` 후 `loop(ms)`가 1 ms마다 회로 과도 해석과 함께 실행됩니다. 펌웨어가 ADC로 읽는 값은 그 순간의 회로 전압이고, 펌웨어가 정한 PWM 듀티·GPIO 값이 곧바로 회로에 반영됩니다. 기본 펌웨어는 소프트 스타트 중 모터 평균 전류가 제한값을 넘으면 듀티를 줄입니다.
- **결과**: 편집기 오른쪽에 PA8 듀티, PA4 출력, 모터 속도·평균 전류 그래프와 `log()` 출력이 나오고, 3D에서 모터 회전과 세 LED 점등이 재생됩니다(재생 막대에 현재 듀티 표시). 오류가 나면 해당 줄을 표시하고 그 줄로 이동할 수 있습니다. 무한 루프는 자동으로 중단됩니다.
- PWM 주파수를 높이면 계산 단계를 자동으로 늘립니다(최대 40,000 단계). 주파수가 아주 높으면 계산 시간이 길어집니다.

### 예제: MCU BLDC 3상 모터 (MOTION-32 BLDC)

**예제: MCU BLDC 3상** 버튼으로 엽니다. 12 V 입력 → LDO → STM32F042K6U6, MCU의 TIM1 핀 PA8·PA10·PA11(PWM)과 PA9·PA12·PA15(EN)가 TI **DRV8313PWPR**(HTSSOP-28, 실제 핀 배치)의 IN1~3·EN1~3를 구동하고, 드라이버 OUT3/OUT2/OUT1이 홀 센서 내장 BLDC 모터 **42BLF01**(MIKROE-4455, 4극쌍, 직결 팬)의 U·V·W 상을 돌립니다. 홀 신호 H1~H3는 PA6·PA7·PB0(내부 풀업)로, DRV8313 nFAULT(오픈 드레인, R10 풀업)는 PB3으로 들어갑니다. 차지 펌프 커패시터(C8 10 nF CPL–CPH, C9 100 nF VCP–VM)와 V3P3 디커플링(C10)도 데이터시트 권장대로 넣었습니다.

- **시뮬레이션 모델**: BLDC는 Y결선 3상 권선(R·L)과 사다리꼴 역기전력, 토크 = Σ kt·f(θe)·i, 관성·마찰을 시간 적분합니다. 홀 센서는 회전자 전기각으로 출력이 정해지는 푸시풀 출력, 드라이버는 상별로 EN·IN에 따라 VM/GND로 스위칭하는 RDS(on) 0.24 Ω(DRV8313 typ) 하프브리지와 바디 다이오드입니다.
- **펌웨어**: `LOOP_PERIOD_US = 50`으로 제어 루프를 50 µs마다(PWM 2 kHz) 돌려 홀 코드 → 6스텝 정류표(STEP)로 상단 PWM 상·하단 ON 상·개방 상을 정하고, 소프트 스타트, 회전 방향(DIRECTION), nFAULT 차단, 홀로 잰 속도 로그, 기계 1회전마다 토글하는 상태 LED를 구현합니다. 기본값으로 약 2,600 rpm까지 가속합니다.

### HSIS 연동

세 예제 보드마다 자기 HSIS(엑셀 형식)와 AUTOSAR Port ARXML 예제가 있어, 보드를 바꾸면 HSIS 작업 공간도 그 보드의 사양으로 바뀝니다(직접 불러온 HSIS는 유지). MCU 예제에서는 기존 검사(핀↔넷, HW 연결, 풀업, SW 설정, 추적성)에 더해 **펌웨어 대조**를 합니다.

- 펌웨어 `setup()`이 출력으로 설정한 핀과 코드에서 읽는 핀(`digitalRead`/`analogRead`)을 HSIS의 포트·방향과 비교합니다(FW_DIR, FW_IN, FW_UNDOC, FW_UNUSED).
- `analogRead`하는 핀에 HSIS의 아날로그/ADC 기능이 있는지(FW_ADC), PWM 주파수가 HSIS 타이밍 열과 같은지(FW_FREQ) 확인합니다. 예를 들어 펌웨어 파라미터 PWM_FREQ_HZ를 바꾸면 해당 HSIS 신호가 곧바로 경고로 바뀝니다.
- HSIS 신호 상세에 **펌웨어** 단계가 추가되어 그 핀을 펌웨어가 어떻게 쓰는지 보여 주고, 펌웨어 편집기 결과에도 HSIS 대조 요약이 나옵니다.
- 예제마다 일부러 넣은 지적 사항이 있습니다: DC 모터 예제는 LED_STATUS의 테스트 ID 누락·ARXML 초기값 불일치, BLDC 예제는 NFAULT 요구사항 누락·HALL2 ARXML 방향 오류.

## 실제 부품과 데이터시트

세 예제 보드는 가능한 한 실제 판매되는 부품으로 구성했습니다. 부품 번호·풋프린트·핀 배치는 제조사 데이터시트를 따릅니다.

| 부품 | 쓰인 곳 | 비고 |
|---|---|---|
| ST STM32F042K6U6 (UFQFPN32) | 세 보드 MCU | 핀 번호·대체 기능(TIM1, ADC_IN, USB) 데이터시트 기준. SENSE-32는 크리스털 없는 USB(HSI48+CRS)로 바꿔 Y1 제거 |
| TI DRV8313PWPR (HTSSOP-28) | BLDC 드라이버 | 28핀 + 써멀 패드, INx/ENx 논리, nFAULT, 차지 펌프 |
| Winbond W25Q32JVSSIQ | SENSE-32 플래시 | SOIC-8 |
| AMS1117-3.3, AOS AO3400A, Vishay SS14 | 전원·스위칭 | |
| Mabuchi FA-130RA / Tamiya 70097 | DC 모터 | 모델 R·kt·J는 공개 사양에서 산출 |
| 42BLF01 (MIKROE-4455) | BLDC 모터 | 정격 사양 기준, R·L은 추정값 |
| Infineon TC364DP-64F300F (TQFP-144) | AURIX TC364 예제 MCU | 핀 번호·포트 기능은 TC36x 데이터시트 기준 |
| Infineon TLE9251VSJ, Abracon ABM8 20 MHz, AMS1117-5.0 | AURIX TC364 예제 | CAN FD 트랜시버(VIO 3.3 V), 크리스털, 5 V LDO |
| JAE MX23A12NF1 / MX23A12SF1 | AURIX TC364 예제 J1 | 2.5 mm 피치 2열 12핀 직각 방수 헤더, 3 A/핀, −40…125 °C, 결합부 실 링·전선 그로밋. 외형 30.5 / 26.5 / 12.5 / 23.5 mm, 실장 높이 18.3 mm는 JAE 표 값이며 슈라우드·플랜지 세부 치수와 PCB 패턴은 근사(도면 SJ100917로 확인 필요) |
| Panasonic EEE-FK1E471P (FK 케이스 G, ø10 × 10.2) | AURIX TC364 예제 C13 | VM 벌크 알루미늄 전해 470 µF 25 V · 랜드 패턴 a 4.6/b 4.1/c 2.0 mm · ESR 80 mΩ·리플 850 mA(유통사 기재) · 극성(+ 패드 1) 실크·3D·회로도 심볼 |
| Kingbright APT1608, Omron B3FS-1000P, Würth 613002/613004/613008, GCT USB4105-GF-A | LED·스위치·커넥터 | USB4105 풋프린트는 단순화 |
| Samsung CL/Murata GRM 커패시터, Yageo RC0603/RL1206 저항 | 수동 소자 | 값으로 정확한 부품 번호 생성 |

- **보기**: 부품을 클릭하면 정보 카드에 제조사, 주요 사양, 데이터시트(PDF)·제품 페이지·Octopart 링크가 나옵니다. 정보 패널의 **데이터** 탭 위쪽에 보드 전체 부품 데이터시트 목록이 있습니다. 데이터베이스에 없는 부품 번호는 검색 링크를 보여 줍니다.
- **저장**: `datasheets/README.md`와 `datasheets/manifest.json`에 부품별 데이터시트 URL 목록이 있습니다. `npm run datasheets:download`(= `node scripts/datasheets.mjs --download`)를 실행하면 PDF를 `datasheets/pdf/`에 내려받고, 뷰어를 로컬 파일로 열면 정보 카드에 로컬 사본 링크도 나옵니다.
- 부품 데이터는 `src/parts/parts.js`에 있습니다. 새 부품을 추가한 뒤 `npm run datasheets`로 목록을 다시 만듭니다.

## HSIS 핀 추천과 MCAL 설정

HSIS 작업 공간의 **핀 추천** 탭은 HSIS의 신호마다 MCU 데이터시트의 핀 기능(ALT/AF)과 상대 IC 핀 기능을 맞춰 MCU 핀을 추천합니다. **MCAL 설정** 탭은 그 배정으로 AUTOSAR 설정 파일과 초기화 코드를 만듭니다.

- **지원 MCU**: Infineon AURIX TC364DP (TQFP-144), ST STM32F042K6U6 (UFQFPN32). 핀 기능 데이터는 `src/parts/mcu-pins.js`에 있습니다.
  - TC364DP: TC36x 데이터시트 V1.1의 포트 기능 표에서 P00·P02·P10·P11·P13·P14.0–2를 넣었습니다. 나머지 포트(P14.3 이후, P15, P20–P23, P33)는 아직 기능 표가 없어 GPIO로만 추천합니다. AN0–AN31 → EVADC Gx CHy 대응은 TC3xx 관례(G = n/8, CH = n mod 8)를 따랐습니다.
  - STM32F042K6U6: 데이터시트 Table 13–15의 AF0–AF7을 그대로 넣었습니다.
- **상대 IC 핀**: DRV8313(IN = PWM, EN = GPIO, nFAULT = 인터럽트), W25Q32(SPI), TLE9251V(CAN TX/RX, STB)는 핀마다 MCU에 필요한 기능을 알고 있습니다. 그 밖의 부품은 HSIS의 핀 기능·방향 열로 판단합니다.
- **추천 방식**:
  1. HSIS 핀 기능·방향과 상대 핀에서 필요한 역할(PWM, 캡처, ADC, SPI, CAN, UART, I2C, 인터럽트, GPIO)을 정합니다.
  2. 그 역할이 가능한 MCU 핀만 후보로 둡니다. 전원·디버그(JTAG/SWD)·EVR 핀은 빼고, 부트 설정(HWCFG) 핀은 감점합니다.
  3. SPI·CAN·UART·I2C는 같은 주변장치 인스턴스로, 홀 캡처는 같은 타이머로 묶습니다. 타이머·ADC 채널과 인터럽트 라인은 겹치지 않게 합니다.
  4. 보드에서 상대 핀까지 거리와, 다른 신호가 필요로 하는 드문 기능을 빼앗는 정도를 비용으로 삼아 헝가리안 매칭으로 고릅니다. 버스 묶음끼리는 처리 순서를 모두 시험해 합이 가장 작은 조합을 씁니다.
- **두 가지 범위**: "빈 핀·오류만"은 맞게 배정된 핀은 두고 빈 핀과 기능이 맞지 않는 핀만 추천합니다. "전체 다시 배정"은 모든 신호를 다시 배치합니다.
- **적용**: 고른 추천을 적용하면 HSIS의 MCU 핀·포트·핀 기능이 바뀌고, 보드에서 MCU 패드가 신호 넷에 연결됩니다. 아직 배선되지 않은 연결은 TOP 보기에 점선으로 나옵니다. 적용 취소와 갱신된 HSIS CSV 내려받기를 지원합니다. 대안 핀 버튼으로 추천을 직접 바꿀 수 있습니다.
- **자동 배선**: 핀 추천 탭의 "자동 배선" 버튼은 HSIS 신호 중 아직 동박으로 이어지지 않은 넷(적용한 추천 포함)을 2층으로 배선합니다. 0.1 mm 격자(가장 촘촘한 패드 피치에 맞춤)에서 다른 넷의 패드·트랙·비아·구멍과 보드 가장자리(0.4 mm)를 트랙 폭·간격만큼 피해 A* 탐색으로 경로를 찾고, 층을 바꿀 때 비아(0.6/0.3 mm)를 넣습니다. 짧은 넷부터 그리고, 실패한 넷은 앞으로 옮겨 최대 3번 다시 시도해 가장 좋은 결과를 남깁니다. 신호·전원 트랙 폭과 간격을 바꿀 수 있고, 전원 넷(GND·동박면 넷 제외)을 포함할 수 있습니다. 결과는 보드의 트랙·비아로 들어가 TOP/BOTTOM/3D와 시뮬레이션에 반영되며, 실제 형상으로 간격을 다시 검사해 위반 건수를 보여 줍니다. "자동 배선 지우기"로 되돌립니다. 차동 쌍·길이 맞춤·임피던스는 다루지 않으므로 검토용 초안으로 쓰세요. AURIX-364 예제는 추천 적용 뒤 25개 넷이 모두 간격 위반 없이 배선됩니다.
- **MCAL 설정 출력**:
  - `*_Mcal.arxml`: AUTOSAR ECUC 값(Port, Dio, Pwm, Adc, Icu, Spi, Can). PortPinId는 패키지 핀 번호이고, PortPinMode는 TC364는 ALT1–ALT7/GPIO, STM32는 AF0–AF7/DIO로 적습니다. "이 ARXML로 HSIS 검사"를 누르면 HSIS 검사기로 바로 대조합니다.
  - MCAL C 설정: `Port_Cfg.h`, `Port_PBcfg.c`(TC3xx `Pn_IOCR`·`OMR`·`PDISC` 값, STM32 `MODER`·`OTYPER`·`PUPDR`·`AFR`·`ODR` 값), `Dio_Cfg.h`, `Pwm_Cfg.h`/`Pwm_PBcfg.c`, `Adc_Cfg.h`, `Icu_Cfg.h`, `Spi_Cfg.h`, `Can_Cfg.h`. MCAL 관례를 따른 예시라 벤더 MCAL 구조체와 1:1로 같지는 않습니다.
  - STM32 HAL/LL: `mcal_hal_init.c`(GPIO, TIM PWM·입력 캡처, ADC, SPI, UART, I2C, CAN 초기화), `mcal_ll_gpio.c`. STM32 보드에서만 만듭니다.
  - 모두 내려받기는 폴더별로 묶은 .zip입니다.
- **예제: AURIX TC364** (`src/app/sample-tc364.js`, AURIX-364 INV): TC364DP, DRV8313, TLE9251V, W25Q32, ECU 커넥터 J1(JAE MX23A12NF1 방수 2 × 6 직각 헤더: 1–3 홀 H1–H3, 4 홀 5 V, 5–6 GND, 7–9 모터 W·V·U, 10 CANL, 11 CANH, 12 KL30 +12 V — 하네스 측 MX23A12SF1), 디버그 UART, 배터리 전압 분압을 배치하고 전원만 배선한 "배치 단계" 보드입니다. HSIS에는 미배정 신호가 대부분이고, IN_W를 아날로그 전용 핀(AN11)에 둔 오류와 CAN을 멀리 있는 CAN00에 둔 사례가 일부러 들어 있습니다. 전원부는 단순화했습니다(코어 VDD는 내부 EVR로 가정).

## HSIS 기반 테스트 케이스 (SWE.6 · SYS.4)

HSIS 작업 공간의 **테스트 케이스** 탭은 HSIS에서 ASPICE 두 프로세스의 시험 케이스를 **따로** 만들고, 수준마다 엑셀(.xlsx)이나 CSV로 따로 내려받습니다. 두 수준의 경계는 **측정 방식과 검증 대상의 계층**입니다(심사 시 중복 지적 방지).

| HSI 도메인 | SYS.4 (SYSITS) — 물리 장비로 실측 | SWE.6 (SWQT) — 디버거·HIL·XCP, SW 관점만 |
|---|---|---|
| 1. 아날로그 입력 | 커넥터 전압 → 분압 → MCU 핀 전압, RC 필터 지연, HW-SW 물리값 정합 | ADC 원시값 경계(BVA, 변환식으로 경계 ±1 LSB 계산), 디바운스, 히스테리시스 |
| 2. 디지털 & PWM | PWM 주파수·Duty·슬루율·Dead-time, 신호 레벨·풀업, 전원 인가·리셋 중 Glitch 부재 | 설정 레지스터·초기 요청값(TC3xx `Pn_IOCR.PCx`, STM32 `MODER`·`AFR`), 출력 요청 → 레지스터 갱신, Duty 상하한 Clamping, 입력 디바운스·상태 |
| 3. 안전 & 인터럽트 | 고장 핀 에지 → 출력 차단 물리 지연(FTTI), 단선·단락 결함 주입 | 인터럽트 → Safe State 상태 머신, 래치 유지, DTC 기록, 타당성 진단 |
| 4. 통신 | SPI 클럭·CS Setup/Hold, CAN 우성·열성 전압·Sample Point·종단 저항 | Timeout, CRC, Alive Counter, Bus-off·재시도·고장 진단 |
| 5. 전원 & PMIC | 전원 레일·리플, 클럭·리셋 파형, IG OFF 후 전원 유지 시간, 워치독 리셋 핀 파형 | 클럭·PLL 상태 로직, 리셋 원인 판별, 워치독 Open Window 피딩, Shutdown(NvM 저장) 시퀀스 |
| 6. MCU 리소스 | 최대 부하 장시간 러닝(리셋·과열 부재) | Map 기반 RAM/Flash, 스택 수위·오버플로, MPU 불법 접근 Trap, CPU 부하·WCET |

- SWE.6 케이스에는 오실로스코프·멀티미터·파워 서플라이 계측이 들어가지 않습니다(테스트로 확인). 입력은 HIL이나 결과 버퍼 스텁으로 주입하고 결과는 디버거·XCP로 봅니다.
- SYS.4는 S1 전원·클럭·리셋 → S2 통신 → S3 I/O → S4 기능 체인·안전·내구 순서의 통합 전략으로 정렬하고, 같은 상대 부품에 모이는 신호는 기능 체인으로 함께 실측합니다.
- **필수 검증 항목**: 수준별 체크리스트가 위 도메인별 필수 항목이 HSIS 신호마다 있는지와 요구사항 추적성을 보여 줍니다.
- **내보내기 시트**: 테스트 케이스(ID, 수준, 검증 도메인, 통합 단계, 분류, 제목, HSIS ID, 신호, 요구사항 ID, ASIL, 우선순위, 시험 기법, 측정 수단, 환경, 사전 조건, 절차, 기대 결과, 합격 기준, 신호 경로), 필수 검증 항목, 추적성, 문서 정보, SYS.4는 통합 전략 시트 추가.
- 디바운스 시간·히스테리시스·FTTI·워치독 윈도우·진단 임계값은 HSIS에 없는 값이라 케이스에 "SW/안전 요구사항 값"으로 표시합니다. 생성 규칙은 `src/hsis/testgen.js`에 있습니다.

## HSIS (HW/SW 인터페이스 사양)

헤더의 **HSIS** 탭은 ASPICE HSIS 산출물을 보드와 SW 설정에 대조해 보는 작업 공간입니다. 처음에는 내장 예제 보드에 맞춘 예제 HSIS가 열립니다.

- **입력**: HSIS 엑셀(.xlsx)·CSV, AUTOSAR Port 설정(.arxml). 머리글 이름으로 열을 찾습니다(ID, 신호명, MCU 핀, 포트, 핀 기능, 방향, 초기값, 풀업/풀다운, 회로도 넷, HW 연결, SW 모듈, SW 설정 ID, API, 요구사항 ID, 테스트 ID, ASIL, 상태 등, 영문 머리글도 인식). `문서 정보` 시트가 있으면 문서 ID·버전·MCU 참조를 읽습니다.
- **화면**: 신호 표, MCU 핀 맵(풋프린트 패드 배치 그대로), 요구사항 → HSIS → 테스트 추적성, 검사 결과, 핀 추천, MCAL 설정, 신호별 HW → MCU → SW → 추적 경로와 보드 미리보기.
- **검사**: MCU 핀 ↔ 회로도 넷, 핀 이름, HW 연결 부품·핀, 외부 풀업·풀다운 저항값, 핀 중복, HSIS에 없는 연결 핀, ARXML PortPin의 핀 번호·방향·초기값, 요구사항·테스트 누락. 결과는 CSV로 복사할 수 있습니다.
- **예제**: `examples/SENSE-32_HSIS.xlsx`, `examples/SENSE-32_Port.arxml`. BOOT0 미연결, 아직 레이아웃에 없는 VBUS_MON, ARXML의 I2C1_SDA 핀 번호 불일치 같은 검사 대상이 일부러 들어 있습니다. ARXML 예제의 PortPinId는 MCU 패키지 핀 번호를 씁니다.

## 개발

```sh
npm run build   # src/ → dist/index.html (외부 의존성 없음, Node 18+)
npm test        # 파서·회로도·시뮬레이션·HSIS 테스트
npm run examples  # examples/ 다시 만들기 (python3 + openpyxl 필요)
npm run dsdb      # datasheets/db/*.html → src/parts/dsdb.js (build가 먼저 실행)
npm run dsdb:init # 페이지가 없는 부품의 데이터시트 초안 만들기
```

| 경로 | 내용 |
|---|---|
| `src/core/pcb-core.js` | 파서(KiCad, Gerber, Excellon, CSV, IPC-D-356)와 공통 보드 모델 |
| `src/sch/sch.js` | KiCad 회로도 파서, 연결성, 보드 넷 매핑, 자동 생성 회로도 |
| `src/sim/sim.js` | 전압 강하, 신호 무결성, 열, MNA 회로 해석 엔진 |
| `src/app/viewer.js` | 2D/3D 렌더러, 선택·검색, 파일 불러오기 UI |
| `src/app/simui.js` | 시뮬레이션 패널과 보드 오버레이 (빌드 시 viewer.js에 삽입) |
| `src/app/sample-mcu.js` | MCU DC 모터·BLDC 3상 예제 보드와 기본 펌웨어 |
| `src/fw/fw.js` | MCU 펌웨어 런타임 (파라미터 추출, 샌드박스, 회로와 1 ms 코시뮬레이션) |
| `src/app/fwui.js` | 펌웨어 파라미터 카드와 코드 편집기 (빌드 시 viewer.js에 삽입) |
| `src/app/sample.js` | 내장 예제 보드 (뷰어 JSON 형식) |
| `src/parts/parts.js` | 실제 부품 데이터베이스(제조사, 사양, 데이터시트 링크) |
| `scripts/datasheets.mjs` | 데이터시트 목록 생성·PDF 내려받기 |
| `datasheets/db/`, `scripts/dsdb.mjs` | 데이터시트 HTML DB(부품당 한 페이지)와 번들러 → `src/parts/dsdb.js` |
| `src/app/modeui.js`, `src/app/dsui.js` | 첫 화면·단계/뷰어 모드, 데이터시트 탭 (빌드 시 viewer.js에 삽입) |
| `src/parts/mcu-pins.js` | MCU 핀 기능 DB (TC364DP, STM32F042K6U6)와 상대 IC 핀 역할 |
| `src/hsis/pinrec.js` | HSIS 기반 핀 배정 추천 (역할 판정, 주변장치 묶음, 헝가리안 매칭, 적용) |
| `src/hsis/mcal.js` | MCAL 설정 생성 (ECUC ARXML, C 설정, STM32 HAL/LL) |
| `src/route/autoroute.js` | 2층 격자 자동 배선 (A*, 비아, 다중 시도, 핀 탈출 예약, rip-up & reroute, 간격 검사) |
| `src/core/pcbedit.js` | 부품 이동·회전·뒤집기, 래츠네스트, DRC, 보드 크기 변경, .kicad_pcb 저장 |
| `src/core/autoplace.js` | 부품 역할 판정, 전략별 자동 배치(담금질 + 정리), 배치 지표, GND 팬아웃 |
| `src/app/pcbcli.js` | 배치·배선 CLI 콘솔과 Claude 연동 (빌드 시 viewer.js에 삽입) |
| `src/app/schcli.js` | 회로도 CLI 콘솔과 Claude 연동 (빌드 시 viewer.js에 삽입) |
| `src/app/copilot.js` | 설계 도우미(단계 콘솔을 한 대화로, 유지/되돌리기 카드), 오른쪽 도킹 패널, 고정 패널 새 창 연동 (빌드 시 viewer.js에 삽입) |
| `src/app/aimode.js` | 결정론/AI 실행 방식, Claude 도구 실행·모델·토큰(추정) 표시, 콘솔의 guide 명령 |
| `src/core/newproj.js` | 새 설계: 블록 라이브러리, 요구사항 → 계획, 전원 트리·손실 점검, MCU 핀 배정, 보드 스펙 |
| `src/app/newui.js` | 새 설계 창과 설계 CLI (빌드 시 viewer.js에 삽입) |
| `src/core/housing.js` | 하우징 설계: 재질·IP·진동 조건, 열 저항망, Steinberg 진동, 스크루·가스켓, OpenSCAD 출력 |
| `src/core/hwarch.js` | HW 아키텍처 블록 다이어그램: 요구사항 → 기능 블록·인터페이스(부품 미정), 편집, 띠 배치 SVG, 회로 계획으로 변환 |
| `src/app/iconui.js` | 기능 아이콘 세트와 선택자 → 아이콘 적용 |
| `src/app/nextui.js` | 지표 띠, 전체 보기 캔버스, 변경 요청 영향, 리비전 원장, 분해·부품 띠 (빌드 시 viewer.js에 삽입) |
| `src/core/revlog.js`, `src/app/revui.js` | 리비전 스냅샷(객체 그래프 인코더)·비교 엔진, 자동 기록·IndexedDB 저장·비교 화면·복원·이력 JSON 내보내기/불러오기 |
| `src/core/sysdiag.js` | 시스템 다이어그램: 설계 계획/보드 → 블록·전원 레일·MCU 신호·외부 연결, 5단 배치, SVG |
| `src/core/text2cad.js` | Text-to-CAD: 하우징 CAD 명령 언어와 한국어/영어 문장 → 명령 해석 |
| `src/app/mechui.js` | 기구 CAD 작업 공간(조건·형상 트리·3D·Text-to-CAD 콘솔·AI), STL/SCAD/zip 내보내기, PCB CLI `housing` (빌드 시 viewer.js에 삽입) |
| `src/core/guide.js` | PCB·회로 설계 가이드라인 규칙, 프리셋, 우선순위, 자동 판정과 준수율 |
| `src/app/sample-tc364.js` | AURIX TC364 예제 보드 |
| `src/hsis/testgen.js` | HSIS 기반 SWE.6(SWQT)·SYS.4(SYSIT) 테스트 케이스 생성, 필수 검증 체크리스트 |
| `src/hsis/hsis.js` | HSIS 열 매핑, ARXML Port 파서, 일관성 검사, 추적성 |
| `src/hsis/sample-hsis.js` | 예제 HSIS와 ARXML |
| `src/app/hsisui.js` | HSIS 작업 공간 UI (빌드 시 viewer.js에 삽입) |
| `src/app/schui.js` | 회로도 보기, 나란히 보기, 크로스 프로빙 (빌드 시 viewer.js에 삽입) |
| `src/app/popui.js` | 여러 보기 새 창(격자 레이아웃·3D·HSIS·시뮬레이션 칸)·떠 있는 창·레이아웃 고르개, 패널 크기 조절 (빌드 시 viewer.js에 삽입) |
| `src/app/body.html`, `src/styles/` | 마크업과 스타일 |
