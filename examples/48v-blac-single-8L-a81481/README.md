# 48 V BLAC 단일 채널 · A81481 · 20 A · 8층 90 × 62 mm (단면 배치)

48 V DC 링크 3상 BLAC 모터 제어기 1채널입니다. 부품 132개가 모두 윗면에 있습니다.

| 기능 | 부품 |
|---|---|
| 전원 | Allegro **A81481** 48 V 단일 칩 안전 PMIC (벅 12.5 V · 5.4 V + LDO 5개) |
| 게이트 드라이버 | Allegro AMT49100 (48 V 직결) |
| FET | onsemi NVTFS6H850N × 12 (스위치당 2병렬, 80 V) |
| MCU | Infineon AURIX TC364DP |
| CAN | TI TCAN1043HD (VSUP 12.5 V) |
| 커넥터 | 입력 MX150 6핀 (BAT×2 · GND×2 · CAN_H · CAN_L) + 출력 MX150 20핀 (U · V · W 각 2접점) |

> **A81481은 출시 전 부품이라 데이터시트가 공개되지 않았습니다.** 핀 번호 · LDO 용도 배분 · 인덕터/커패시터 값은 A81411 계열 기준 **가정**입니다(`datasheets/pins.json`의 "ASSUMED PIN MAP"). 이 보드는 구조와 면적 검토용이며 그대로 출도할 수 없습니다. MX150 · WDFN8 풋프린트 치수도 제조사 도면으로 확인해야 합니다.

## 결과
- 미연결 0 · DRC 0 · 비아 전류 미달 없음
- 상 전류 폭 PH_U 11.35 · PH_V 10.35 · PH_W 12.03 mm (20 A · 2 oz · ΔT 20 °C 필요 폭 6.14 mm)
- 션트 노드 폭 11.48–13.65 mm (필요 3.81 mm)
- +48 V 평면 온도 상승 +21 °C로 표시됨(한도 20 °C)

## 만든 방법 (v1.130.0)
```
node scripts/pcbrun.cjs --plan examples/48v-blac-single-8L-a81481/plan.json --w 90 --h 62 --snap --kicad --shots \
  --cmds "board layers 8; board size 90 62 --anchor center; reset --strategy compact --seed 1; route; route --ai --agents --rules --noRoute --steps 10"
```
자동 배선 후 신호 1건(PH_INL_W)이 남았고 오케스트레이션(규칙 처방) 3단계 22 s에 이었습니다.

## 크기 탐색 (시드 1)
| 크기 | 결과 |
|---|---|
| **90 × 62** | 전부 통과 |
| 95 × 56 | 미연결 0, GND 비아 한 곳 +54 °C |
| 82 × 64 | 미연결 0, FET 한 곳 션트 노드 비아 0개 |
| 85 × 62 | 상 전류 폭 미달 (PH_U 3.24 mm) |
| 90 × 58 · 88 × 60 | 미연결 10 · 4 |

시드 하나의 결과입니다. 앱에서는 [파일 불러오기] → "예제: 48 V BLAC 단일 (A81481) 90 × 62".
