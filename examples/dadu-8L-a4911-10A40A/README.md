# Dadu — A4911 · 상시 10 A / 피크 40 A (2 s) · 8층 양면 90 × 60 mm (자동 배선 완료)

상시(연속) 상전류 10 A, 기동 · 구속 피크 40 A가 2초 이내인 조건. 손실 · 발열과 상시 패턴 폭은 10 A로, MOSFET · 션트 범위 · 단자 · 피크 패턴 폭 · 비아는 40 A · 2 s로 정했습니다.

| 파일 | 내용 |
|---|---|
| `Dadu_8L_A4911_10A_40A_90x60.kicad_pcb` | KiCad 보드 파일 |
| `top.jpg` / `bottom.jpg` | 위층 / 아래층(좌우 반전 보기) 화면 |

## 만든 방법 (v1.80.1)
```
node scripts/pcbrun.cjs --cur "~10 A (소형 팬 · 펌프)" --param "gdrv3.driver=A4911,gdrv3.ipk=40,gdrv3.tpk=2" \
  --cmds "board layers 8; board size 90 60 --anchor center; reset --strategy compact --both --seed 11; route"
```

## 결과 (2 oz · 상시 ΔT 20 °C · 피크 한도 40 °C)
필요 폭 4.44 mm = 상시 10 A IPC 폭(2.36 mm)보다 넓게 — 상시 +7.1 °C에 피크 40 A 2 s 동안 +32.9 °C를 더해 40 °C 이내.

| 넷 | 유효 폭 (위 + 아래) | 상시 상승 | 피크 끝 상승 |
|---|---|---|---|
| PH_U | 9.95 mm | +1.9 °C | +8.5 °C |
| PH_V | 9.90 mm | +1.9 °C | +8.5 °C |
| PH_W | 7.49 mm | +3.0 °C | +14.6 °C |
| VIN_RAW | 17.93 mm | +0.7 °C | +2.7 °C |
| 상 → 션트 | 패드 직결 | — | — |

- 내층 평면: GND 2층 · +12V 1층 — 상시 +1.5 / +4.6 °C, 피크 끝 +1.9 / +6.2 °C
- 단자 비아(층을 바꾸는 몫): 전부 통과. 전력 패드 안 비아 0.6/0.3 mm
- 미연결 0 · DRC 0 · 아래층 부품 44개 · 션트 1 mΩ 2010(피크 40 mV · 1.6 W 2 s ≤ 단시간 과부하 1.875 W)

## 미세 피치 핀 탈출 순서 (v1.80.1)
이전 시드 23 결과는 미연결 2곳(SPI SDO · V상 게이트)이 남았습니다. SDO는 0.5 mm 피치 QFP 두 개(TC364 · A4911)에서 SCK · SDI 사이에 낀 핀이라, 이웃이 먼저 배선되며 양쪽 핀 앞 자리를 다 차지해 한 가닥도 나가지 못했습니다. 배선 순서에 "연속된 신호 핀 구간의 가운데 핀부터" 규칙을 넣은 뒤 같은 시드 23은 미연결 1, 시드 11은 미연결 0이 되었습니다.


## v1.109.0 다시 배치 · 배선
TPS3823 리셋 IC 핀 배치를 데이터시트대로 고쳤습니다(1 RESET · 2 GND · 3 MR → VDD · 4 WDI · 5 VDD). 이전 판은 +3V3이 GND 핀에 연결돼 있었습니다. 회로 생성 때의 자동 보강(인터페이스 풀 저항 · 커넥터 ESD · 커패시터 품번 교체)도 반영해 다시 배치 · 배선했습니다.
```
node scripts/pcbrun.cjs --profile Dadu --cur "~10 A (소형 팬 · 펌프)" --param gdrv3.driver=A4911,gdrv3.ipk=40,gdrv3.tpk=2 \
  --cmds "board layers 8; board size 90 60 --anchor center; reset --strategy compact --both --seed 1; route"
```
결과: 90 × 60 mm · 8층 · 아래층 부품 46개 · 미연결 0 · DRC 0 · 전류 폭(유효/필요 mm) PH_U 9.96/4.44 · PH_V 9.7/4.44 · PH_W 8.62/4.44 · VIN_RAW 28.12/4.44 · PH_U_SNS 직결/4.44 · PH_V_SNS 직결/4.44

## v1.115.0 리셋 연결 수정 후 다시 배선
감시 IC(TPS3823) RESET 출력이 MCU 리셋 핀(PORST)에 연결되도록 회로를 고치고 다시 배치 · 배선했습니다(이전 판은 출력이 `NRST` 넷에 혼자 있어 MCU에 닿지 않았음).
```
... reset --strategy compact --both --seed 1; route --ai
```
결과: 90 × 60 mm · 8층 · 미연결 0 · DRC 0 · 전류 폭 충족 · 비아 전류 통과
