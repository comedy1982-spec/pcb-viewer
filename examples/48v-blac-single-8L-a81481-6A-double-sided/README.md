# 48 V BLAC 단일 채널 · A81481 · 6 A · 8층 80 × 62 mm (양면 배치)

[6 A 단면 예제(84 × 66)](../48v-blac-single-8L-a81481-6A/)와 같은 회로를 양면으로 배치한 보드입니다. 부품 113개 중 29개(전원 · MCU · 통신 · 센싱 쪽 패시브와 소형 IC)가 아랫면에 있고, FET · 게이트 드라이버 · 커넥터는 윗면에 있습니다. 면적은 단면 대비 −10.5 %입니다.

> A81481은 출시 전 부품이라 핀 배치가 **가정**입니다. 그대로 출도할 수 없습니다.

## 결과
- 미연결 0 · DRC 0 · 비아 전류 미달 없음
- 상 폭 PH_U 9.83 · PH_V 12.15 · PH_W 12.78 mm (필요 1.17 mm), 평면 온도 상승 +48 V +1.4 °C · GND +0.4 °C
- 미세 피치 IC 반대면 바로 아래에는 부품이 없습니다

## 더 작은 크기 (양면 · 시드 1)
78 × 62 미연결 1 · 80 × 60 미연결 2 · 78 × 60 미연결 2 · 76 × 62 미연결 3과 간격 오류 1 · 76 × 60 미연결 5 · 80 × 58 미연결 15.

## 만든 방법 (v1.136.0)
```
node scripts/pcbrun.cjs --plan examples/48v-blac-single-8L-a81481-6A-double-sided/plan.json --w 80 --h 62 --snap --kicad --shots \
  --cmds "board layers 8; board size 80 62 --anchor center; reset --strategy compact --both --seed 1; route; route --ai --agents --rules --noRoute --steps 12"
```
자동 배선 후 신호 2건이 남았고 오케스트레이션(규칙 처방)이 3단계에 이었습니다.

앱에서는 [파일 불러오기] → "예제: 48 V BLAC 단일 · 6 A 양면 80 × 62".
