# Dadu — 8층 100 × 65 mm 배선 결과 (v1.70.1)

12 V BLDC 모터 구동 보드(TC364 MCU · 게이트 드라이버 · 인피니언 하프브리지 MOSFET 3개 · CAN-FD · 홀 센서 9 V · PCB 온도 센서), 상전류 20 A.

| 파일 | 내용 |
|---|---|
| `Dadu_8L_100x65.kicad_pcb` | KiCad 보드 파일(배치 · 배선 · 동박 · 내층 평면) |
| `top.png` / `bottom.png` | 위층 / 아래층 화면 |

## 앱에서 열기
앱의 예제 목록에 들어 있음: [파일 불러오기] → **예제: Dadu 8층 (배선 완료)**, 또는 머리의 보드 선택 → 보드 추가 → 예제: Dadu 8층. 회로 생성기로 같은 보드를 만든 뒤 저장된 배치·배선(`src/app/sample-dadu8.js`)을 덮어 PCB 단계로 열림.

## 만든 방법
앱에서 신규 설계 → Dadu 프로필(FET 첫 옵션, 전류 ~20 A, 패키지 축소 2단계, compact 전략, 보드 100 × 65 mm) → PCB 콘솔:
```
board layers 8
reset --strategy compact
route
```

## 층 구성
F.Cu 신호 · In1 GND · In2 신호 · In3 GND · In4 +12V 평면 · In5 신호 · In6 +3V3 평면 · B.Cu 신호

## 결과
- 배선 76 s · DRC 0건 · 래츠네스트(미연결) 0개
- 2 oz 동박 · 온도 상승 20 °C 기준(IPC-2221) 20 A 필요 폭 6.14 mm:

| 넷 | 유효 폭(위 + 아래) | 판정 |
|---|---|---|
| PH_U | 9.78 mm | ✓ |
| PH_V | 9.59 mm | ✓ |
| PH_W | 9.72 mm | ✓ |
| VIN_RAW | 19.05 mm | ✓ |
| PH_U/V/W_SNS | 션트가 FET 소스에 직결 | ✓ |

## 주의
- 입력 · 모터 단자는 7.62 mm 피치 2 · 3핀 — 품번 미지정(제조 전에 정격 20 A 이상 단자로 지정).
- 자동 배치에 무작위성이 있어 다시 돌리면 배치 · 폭 수치가 조금 달라짐(같은 설정 2회 모두 미연결 0 · DRC 0 · 모든 전력 넷 ✓).


## v1.109.0 다시 배치 · 배선
TPS3823 리셋 IC 핀 배치를 데이터시트대로 고쳤습니다(1 RESET · 2 GND · 3 MR → VDD · 4 WDI · 5 VDD). 이전 판은 +3V3이 GND 핀에 연결돼 있었습니다. 회로 생성 때의 자동 보강(인터페이스 풀 저항 · 커넥터 ESD · 커패시터 품번 교체)도 반영해 다시 배치 · 배선했습니다.
```
node scripts/pcbrun.cjs --profile Dadu --param gdrv3.driver=IR2104 \
  --cmds "board layers 8; board size 100 65 --anchor center; reset --strategy compact --seed 2; route"
```
결과: 100 × 65 mm · 8층 · 아래층 부품 0개 · 미연결 0 · DRC 0 · 전류 폭(유효/필요 mm) PH_U 9.98/6.14 · PH_V 10.12/6.14 · PH_W 8.95/6.14 · VIN_RAW 24.17/6.14 · PH_U_SNS 직결/6.14 · PH_V_SNS 직결/6.14

## v1.115.0 리셋 연결 수정 후 다시 배선
감시 IC(TPS3823) RESET 출력이 MCU 리셋 핀(PORST)에 연결되도록 회로를 고치고 다시 배치 · 배선했습니다(이전 판은 출력이 `NRST` 넷에 혼자 있어 MCU에 닿지 않았음).
```
... reset --strategy compact --seed 5; route --ai
```
결과: 100 × 65 mm · 8층 · 미연결 0 · DRC 0 · 전류 폭 충족 · 비아 전류 미달: GND R28 9개 +25°C
션트 R28 GND 귀환 비아 9개 +25 °C로 비아 점검 미달(이 예제는 비아 점검을 요구하지 않음).

## v1.116.0 패드 테두리 비아
같은 설정(시드 5, `route`)에서 션트 GND 귀환에 패드 테두리 비아 3개가 추가돼 비아 전류 점검까지 통과합니다.
