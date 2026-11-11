# Dadu: ECU 커넥터 하나 · DRV8334 · 상시 10 A / 피크 30 A · 8층 100 × 70 mm

Dadu 3상 BLDC 컨트롤러(AURIX TC364, CAN-FD, 홀 센서)입니다. 차량 쪽 연결을 **Molex MX150 방수 20핀 커넥터 하나**로 모았고, 게이트 드라이버는 TI **DRV8334-Q1**입니다.

## ECU 커넥터 핀 (MX150 2열 20핀, 3.50 mm)
| 핀 | 신호 | 핀 | 신호 |
|---|---|---|---|
| 1 | BAT (12 V) | 11 | BAT |
| 2 | GND | 12 | GND |
| 3 | 9V (홀 센서 공급) | 13 | HALL_U |
| 4 | HALL_V | 14 | HALL_W |
| 5 | HALL_GND (센서 리턴) | 15 | SPARE_AIN (예비 아날로그 입력) |
| 6 | SPARE_PWM (예비 PWM 출력) | 16 | NC |
| 7 | CAN_H | 17 | CAN_L |
| 8 | U | 18 | U |
| 9 | V | 19 | V |
| 10 | W | 20 | W |

전력 신호(BAT · GND · U · V · W)는 접점 2개씩 병렬입니다(접점당 15 A, 피크 30 A). 품번과 풋프린트 치수는 Molex 34830 도면으로 확인해야 합니다.

## 만든 방법 (v1.102.0)
```
node scripts/pcbrun.cjs --profile Dadu --cur "~10 A (소형 팬 · 펌프)" \
  --param pwr_in.conn=ecu,gdrv3.driver=DRV8334,gdrv3.i=10,gdrv3.ipk=30,gdrv3.tpk=2 --add spare --w 100 --h 70 \
  --cmds "board layers 8; board size 100 70 --anchor center; reset --strategy compact --both --top sense,power --drv-gap 12 --seed 6; route"
```
배치 37 s, 배선 69 s(헤드리스)입니다.

## 결과 (2 oz · 상시 ΔT 20 °C · 피크 한도 40 °C)
| 넷 | 유효 폭 (필요 3.51 mm) | 상시 상승 | 피크 30 A 2 s 끝 |
|---|---|---|---|
| U | 5.82 mm | +4.5 °C | +10.8 °C |
| V | 4.40 mm | +7.2 °C | +18.8 °C |
| W | 8.90 mm | +2.2 °C | +4.6 °C |
| BAT (VIN_RAW) | 16.55 mm | +0.8 °C | +1.3 °C |

- 미연결 0, DRC 0, 아래층 부품 18개
- 전력 비아 16곳 모두 통과, 내층 평면 GND +1.3 °C · +12V +4.3 °C
- 역접속 FET은 피크 30 A라 D2PAK-7(IPB180P04P4L-02)입니다.

## 참고
- 같은 설정의 다른 시드(1 · 2 · 3 · 9)는 미연결 2–12개가 남았습니다. 이 구조는 아직 시드에 따라 결과가 크게 갈립니다.
- V 상은 MX150 3.5 mm 접점 열 사이 가운데라, 커넥터 구간 폭이 층당 2.2 mm입니다.
- DRV8334 주문 품번(E/Q 온도 등급)과 HTQFP 노출 패드 치수는 TI 패키지 도면으로 확인해야 합니다.
