# ELD only — A4911 H-브리지 · 상시 7 A / 피크 20 A (2 s) · ECU 커넥터 하나 · 6층 양면 80 × 55 mm (자동 배선 완료)

Dadu 기반 ELD 솔레노이드 ECU. 12 V 입력, TC364 · CAN-FD · PMIC, PCB 위 센서는 NTC 하나.
A4911(3상 드라이버)의 A·B 레그로 H-브리지(하프브리지 IAUC60N04S6N050H ×2, 레그 션트 2 mΩ ×2), C 레그는 비워 두고 SPI로 그 고장(VC · CHO · CLO · OC3)을 마스크.

## ECU 커넥터 — Molex MX150 방수 직각 PCB 헤더 2×6 (34830 계열)
맞물림 피치 3.50 mm · 1.5 mm 단자 · 접점당 최대 정상 전류 15 A · IP67/IP69K · −40…125 °C. 피크 20 A가 15 A를 넘어 전력 신호는 2접점(같은 열의 안·바깥 핀)씩.

| 열 (보드 안쪽 → 끝) | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| 안쪽 줄 (핀 1–6) | BAT | GND | IGN | CAN_H | ELD+ | ELD− |
| 바깥 줄 (핀 7–12) | BAT | GND | NC | CAN_L | ELD+ | ELD− |

품번 `0348301201`은 계열 규칙(0348300801 = 8핀)으로 추정, 풋프린트는 가정 치수(3.50 mm 격자, 구멍 1.4 mm) — 출도 전 Molex 도면으로 확인. 상대 커넥터는 MX150 2열 12핀 리셉터클(33472 계열). J2 · J3은 보드 안 디버그 헤더(DAP · UART).

| 파일 | 내용 |
|---|---|
| `ELD_6L_A4911_7A_20A_80x55.kicad_pcb` | KiCad 보드 파일 |
| `top.jpg` / `bottom.jpg` | 위층 / 아래층 화면 |

## 만든 방법 (v1.83.0)
```
node scripts/pcbrun.cjs --profile "ELD only" --cur "~7 A (ELD 솔레노이드)" --w 80 --h 55 \
  --cmds "board layers 6; board size 80 55 --anchor center; reset --strategy compact --both --seed 2; route"
```

## 결과 (2 oz · 상시 ΔT 20 °C · 피크 한도 40 °C)
| 넷 | 유효 폭 (필요 2.3 mm) | 피크 끝 상승 |
|---|---|---|
| HB_A (ELD+) | 5.38 mm | +7.9 °C |
| HB_B (ELD−) | 3.68 mm | +16.3 °C |
| VIN_RAW (BAT) | 15.6 mm | +1.1 °C |

- 내층 평면 GND · +12V +2.9 °C, 단자 비아 10곳 통과. 미연결 0 · DRC 0 · 아래층 부품 33개.
- 같은 조건 시드 1 · 3은 신호 미배선 4 · 1개가 남음.
