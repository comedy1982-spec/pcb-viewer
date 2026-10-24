# Dadu — A4911 게이트 드라이버 · 8층 양면 90 × 60 mm (자동 배선 + 수작업 3곳)

`gdrv3 --driver A4911`(Allegro A4911 한 칩으로 FET 6개 구동 · 내장 센스 앰프 · SPI). 자동 배선 결과 DRC 0 · 상/입력 전류 폭 충족, **미연결 3곳은 KiCad에서 손으로 연결**.

| 파일 | 내용 |
|---|---|
| `Dadu_8L_A4911_90x60.kicad_pcb` | KiCad 보드 파일 |
| `top.png` / `bottom.png` | 위층 / 아래층 화면 |

## 만든 방법
```
node scripts/pcbrun.cjs --param gdrv3.driver=A4911 --cmds "board layers 8; board size 90 60 --anchor center; reset --strategy compact --both --seed 1; route"
```

## 결과
- 8층: 신호 · GND · 신호 · GND · +12V · 신호 · +3V3 · 신호, 아래층 부품 47개, DRC 0
- 20 A 필요 폭 6.14 mm: PH_U 7.31 · PH_V 9.87 · PH_W 8.62 · VIN_RAW 18.2 mm ✓

## 손으로 이을 3곳 (KiCad 좌표, mm)
| 넷 | 시작 | 끝 | 거리 | 방법 |
|---|---|---|---|---|
| GND | 트랙 끝 (74.90, 43.40) | U7(A4911) 9번 GND (75.02, 44.58) | 1.2 | 위층 짧은 트랙 |
| PH_U_SNSM | R17(넷 타이) 1번 (82.34, 28.02) | U7 34번 CS1M (78.02, 53.08) | 25 | 내층 신호층(In2/In5), PH_U_SNS(CS1P) 선과 나란히 · 같은 길이로 (켈빈 쌍) |
| PH_ISNS_V_AMP | R25(RC 필터) 1번 (56.75, 69.50) | U7 32번 CS2O (77.02, 53.08) | 26 | 내층 신호층 |

## 주의
- 펌웨어 초기화에서 SPI로 SAO = 11(오프셋 1.5 V) · 이득 20 — MCU ADC 3.3 V 범위 안(0.7~2.3 V). OOS도 ADC로 읽어 빼기.
- 부트스트랩 68 nF는 VREG 8 V 기준 계산 — VRG = 1(11 V)이면 여유 증가.
- 입력 · 모터 단자 품번 미지정(정격 20 A 이상).
