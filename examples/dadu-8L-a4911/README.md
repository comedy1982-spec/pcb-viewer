# Dadu — A4911 게이트 드라이버 · 8층 양면 90 × 60 mm (자동 배선 + 수작업 1곳)

`gdrv3 --driver A4911`(Allegro A4911 한 칩으로 FET 6개 구동 · 내장 센스 앰프 ×3 · SPI 진단). 자동 배선 결과 DRC 0 · 상/입력 전류 폭 충족, **미연결 1곳(PWM 신호)은 KiCad에서 손으로 연결**.

| 파일 | 내용 |
|---|---|
| `Dadu_8L_A4911_90x60.kicad_pcb` | KiCad 보드 파일 |
| `top.png` / `bottom.png` | 위층 / 아래층(좌우 반전 보기) 화면 |

## 만든 방법 (v1.73.1 이후)
```
node scripts/pcbrun.cjs --param gdrv3.driver=A4911 --cmds "board layers 8; board size 90 60 --anchor center; reset --strategy compact --both --seed 47515; route"
```

## 결과
- 8층: 신호 · GND · 신호 · GND · +12V · 신호 · +3V3 · 신호, 아래층 부품 51개, DRC 0
- 20 A 필요 폭 6.14 mm (2 oz · ΔT 20 °C): PH_U 9.75 · PH_V 9.67 · PH_W 6.53 · VIN_RAW 17.6 mm ✓

## 손으로 이을 1곳 (KiCad 좌표, mm)
| 넷 | 시작 | 끝 | 거리 | 방법 |
|---|---|---|---|---|
| PH_INL_U (U상 로우사이드 PWM) | U4(TC364) 9번 (44.50, 45.25) | U7(A4911) 19번 LA (72.02, 49.08) | 28 | 내층 신호층(In2 · In5), 0.2 mm |

연결 뒤 KiCad DRC를 다시 돌려 확인.

## A4911 주변 설계 (데이터시트 A4911-1 Rev. 11 기준)
- VBB · VBRG 100 nF, VREG 22 µF 세라믹 25 V, 차지펌프 CP1–CP2 470 nF
- 부트스트랩 68 nF 25 V ×3 — CBOOT = 20 × Qg(17 nC) / VREG(8 V) × 1.5
- 센스 앰프: 션트 2 mΩ, CSxP · CSxM은 켈빈(0 Ω 넷 타이로 션트 양 끝에서 독립 연결), CSxO → 1 kΩ · 1 nF → MCU ADC, OOS도 ADC
- LSSx: 0 Ω 넷 타이로 로우사이드 FET 소스에서 독립 연결, GND 핀 6 · 9는 노출 패드로 몸체 아래 연결
- DIAG 10 kΩ 풀업, ENABLE 10 kΩ 풀다운, SPI(QSPI1) · STRn · RESETn, PWM ×6(GTM)

## 펌웨어
- 초기화에서 SPI로 SAO = 11(오프셋 1.5 V) · 이득 20 → 센스 출력 0.7~2.3 V(3.3 V ADC 안). OOS를 읽어 CSxO에서 빼기.
- VREG 기본 8 V(VRG = 0). VRG = 1(11 V)이면 부트스트랩 여유 증가.

## 주의
- 입력 · 모터 단자 품번 미지정(정격 20 A 이상으로 지정).
- 같은 설정의 다른 시드: 31677은 미연결 0이지만 PH_V 4.81 mm(부족), 나머지는 미연결 1~3.
