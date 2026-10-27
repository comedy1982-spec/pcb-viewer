# ELD only — A4911 H-브리지 · 상시 7 A / 피크 20 A (2 s) · 6층 양면 80 × 55 mm (자동 배선 완료)

Dadu 기반 ELD 솔레노이드 ECU. 12 V 입력, 외부 커넥터는 입력 3핀(BAT · IGN · GND)과 출력 ELD 2핀, TC364 · CAN-FD · PMIC, PCB 위 센서는 NTC 하나.
A4911(3상 드라이버)의 A·B 레그로 H-브리지를 만들고(하프브리지 IAUC60N04S6N050H ×2, 레그 션트 2 mΩ ×2), C 레그는 비워 두고 SPI로 그 고장(VC · CHO · CLO · OC3)을 마스크합니다.

| 파일 | 내용 |
|---|---|
| `ELD_6L_A4911_7A_20A_80x55.kicad_pcb` | KiCad 보드 파일 |
| `top.jpg` / `bottom.jpg` | 위층 / 아래층 화면 |

## 만든 방법 (v1.82.0)
```
node scripts/pcbrun.cjs --profile "ELD only" --cur "~7 A (ELD 솔레노이드)" --w 80 --h 55 \
  --cmds "board layers 6; board size 80 55 --anchor center; reset --strategy compact --both --seed 1; route"
```

## 결과 (2 oz · 상시 ΔT 20 °C · 피크 한도 40 °C)
필요 폭 2.3 mm (상시 7 A IPC 폭 · 피크 20 A 2 s 반영).

| 넷 | 유효 폭 (위 + 아래) | 피크 끝 상승 |
|---|---|---|
| HB_A (ELD+) | 8.65 mm | +3.2 °C |
| HB_B (ELD−) | 6.63 mm | +5.3 °C |
| VIN_RAW (BAT) | 18.86 mm | +0.8 °C |
| 레그 → 션트 | 패드 직결 | — |

- 내층 평면 GND · +12V: +2.9 °C. 단자 비아 12곳 전부 통과(전력 패드 안 비아 0.6/0.3 mm).
- 미연결 0 · DRC 0 · 아래층 부품 29개.
- 같은 조건 시드 2 · 3은 신호 미배선 4 · 5개와 션트 GND 비아 부족이 남았습니다 — 시드를 바꿔 가며 고르는 것을 권장.
