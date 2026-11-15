# Dadu — 8층 양면 85 × 55 mm (v1.72.0)

`examples/dadu-8L`(100 × 65 mm, 단면 배치)과 같은 회로를 **양면 배치**로 줄인 보드. 면적 28 % 감소(6500 → 4675 mm²).

| 파일 | 내용 |
|---|---|
| `Dadu_8L_2side_85x55.kicad_pcb` | KiCad 보드 파일 |
| `top.png` / `bottom.png` | 위층 / 아래층(좌우 반전 보기) 화면 |

## 앱에서 열기
[파일 불러오기] → **예제: Dadu 8층 양면 85 × 55**, 또는 머리의 보드 선택 → 보드 추가 → 예제.

## 만든 방법
```
board layers 8
board minimize --both --route --strategy compact --tries 6
```
최소화가 77.5 × 50.5 → 80.5 × 52.5 → 85 × 55 mm 순으로 배치 · 배선해 보고, 미연결 · DRC · 전류 폭이 모두 통과한 가장 작은 크기를 남김.

## 결과
- 아래층 부품 48개(수동 부품 · 소형 IC — 파워스테이지 · 입력 영역 부품은 위층 고정, 그 영역 아래층은 상 전류 동박용으로 비움)
- 미연결 0 · DRC 0
- 20 A 필요 폭 6.14 mm: PH_U 9.54 · PH_V 9.62 · PH_W 7.41 · VIN_RAW 19.8 mm ✓

## 주의
- 양면 조립(리플로 2회) 비용이 듦.
- 80.5 × 52.5 mm까지는 부품이 들어가지만 배선 · 상 전류 폭이 매번 1~3건 모자라 채택하지 않음.
- 입력 · 모터 단자 품번 미지정(정격 20 A 이상으로 지정 필요).


## v1.109.0 다시 배치 · 배선
TPS3823 리셋 IC 핀 배치를 데이터시트대로 고쳤습니다(1 RESET · 2 GND · 3 MR → VDD · 4 WDI · 5 VDD). 이전 판은 +3V3이 GND 핀에 연결돼 있었습니다. 회로 생성 때의 자동 보강(인터페이스 풀 저항 · 커넥터 ESD · 커패시터 품번 교체)도 반영해 다시 배치 · 배선했습니다.
```
node scripts/pcbrun.cjs --profile Dadu --param gdrv3.driver=IR2104,pwr_in.revq=dpak \
  --cmds "board layers 8; board size 85 55 --anchor center; reset --strategy compact --both --seed 10; route"
```
결과: 85 × 55 mm · 8층 · 아래층 부품 52개 · 미연결 0 · DRC 0 · 전류 폭(유효/필요 mm) PH_U 9.79/6.14 · PH_V 10.5/6.14 · PH_W 7.49/6.14 · VIN_RAW 18.9/6.14 · PH_U_SNS 직결/6.14 · PH_V_SNS 직결/6.14
입력 역접속 FET은 DPAK을 유지합니다(85 × 55에 D2PAK-7이 들어가지 않음). 그래서 +12V Q1 비아 전류 점검은 이전처럼 통과하지 못합니다.
