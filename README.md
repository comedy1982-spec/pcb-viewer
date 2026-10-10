# PCB 뷰어

브라우저에서 PCB 설계 파일을 바로 열어 3D와 TOP/BOTTOM 2D로 살펴보고, 간단한 전기·열 시뮬레이션까지 돌려보는 단일 HTML 도구입니다. ASPICE HSIS를 회로도·SW 설정과 대조하는 작업 공간도 들어 있습니다. 파일은 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.

## 사용법

`dist/index.html`을 브라우저로 열고 **파일 불러오기**를 누르거나 파일을 끌어다 놓습니다. 3D 뷰(Three.js), zip 해제(JSZip), 엑셀 읽기(SheetJS)는 CDN에서 불러오므로 인터넷 연결이 필요합니다.

| 입력 | 표시되는 내용 |
|---|---|
| KiCad `.kicad_pcb` (v5–v10) | 동박·채워진 존·실크·외곽선·부품·핀 기능·넷 |
| Gerber RS-274X + Excellon (zip 가능) | 레이어 형상, 드릴. X2 속성이 있으면 넷·부품 |
| Pick-and-Place CSV/.pos | 부품 위치와 3D 바디 |
| BOM CSV | 값, 부품 번호, 설명 |
| IPC-D-356 | Gerber 패드·트랙의 넷 |
| 뷰어 JSON | 데이터 탭의 구조 참고 |

ODB++, IPC-2581, Altium/Eagle 원본 파일은 아직 읽지 못합니다.

## 시뮬레이션

오른쪽 패널의 **시뮬레이션** 탭에서 실행합니다. 설계 초기 검토용 근사 계산입니다.

- **전원 경로**: 트랙·비아 저항망을 풀어 부하 핀 전압 강하, 배선 손실, IPC-2221 트랙 온도 상승을 계산합니다.
- **신호**: Hammerstad 마이크로스트립 식으로 특성 임피던스와 지연, 차동쌍 길이 차·스큐·차동 임피던스를 구합니다.
- **열**: 보드를 얇은 판으로 보고 FR-4·동박 면방향 전도와 양면 대류로 정상 상태 온도 분포를 풉니다.
- **회로**: 넷리스트와 부품 값으로 MNA(수정 절점 해석) DC·과도 해석을 합니다. IC는 레귤레이터/정전류 부하 모델로 대체하며, 크리스털·트랜지스터·디지털 동작은 모델링하지 않습니다.

## HSIS (HW/SW 인터페이스 사양)

헤더의 **HSIS** 탭은 ASPICE HSIS 산출물을 보드와 SW 설정에 대조해 보는 작업 공간입니다. 처음에는 내장 예제 보드에 맞춘 예제 HSIS가 열립니다.

- **입력**: HSIS 엑셀(.xlsx)·CSV, AUTOSAR Port 설정(.arxml). 머리글 이름으로 열을 찾습니다(ID, 신호명, MCU 핀, 포트, 핀 기능, 방향, 초기값, 풀업/풀다운, 회로도 넷, HW 연결, SW 모듈, SW 설정 ID, API, 요구사항 ID, 테스트 ID, ASIL, 상태 등, 영문 머리글도 인식). `문서 정보` 시트가 있으면 문서 ID·버전·MCU 참조를 읽습니다.
- **화면**: 신호 표, MCU 핀 맵(풋프린트 패드 배치 그대로), 요구사항 → HSIS → 테스트 추적성, 검사 결과, 신호별 HW → MCU → SW → 추적 경로와 보드 미리보기.
- **검사**: MCU 핀 ↔ 회로도 넷, 핀 이름, HW 연결 부품·핀, 외부 풀업·풀다운 저항값, 핀 중복, HSIS에 없는 연결 핀, ARXML PortPin의 핀 번호·방향·초기값, 요구사항·테스트 누락. 결과는 CSV로 복사할 수 있습니다.
- **예제**: `examples/SENSE-32_HSIS.xlsx`, `examples/SENSE-32_Port.arxml`. BOOT0 미연결, 아직 레이아웃에 없는 VBUS_MON, ARXML의 I2C1_SDA 핀 번호 불일치 같은 검사 대상이 일부러 들어 있습니다. ARXML 예제의 PortPinId는 MCU 패키지 핀 번호를 씁니다.

## 개발

```sh
npm run build   # src/ → dist/index.html (외부 의존성 없음, Node 18+)
npm test        # 파서·시뮬레이션·HSIS 테스트
npm run examples  # examples/ 다시 만들기 (python3 + openpyxl 필요)
```

| 경로 | 내용 |
|---|---|
| `src/core/pcb-core.js` | 파서(KiCad, Gerber, Excellon, CSV, IPC-D-356)와 공통 보드 모델 |
| `src/sim/sim.js` | 전압 강하, 신호 무결성, 열, MNA 회로 해석 엔진 |
| `src/app/viewer.js` | 2D/3D 렌더러, 선택·검색, 파일 불러오기 UI |
| `src/app/simui.js` | 시뮬레이션 패널과 보드 오버레이 (빌드 시 viewer.js에 삽입) |
| `src/app/sample.js` | 내장 예제 보드 (뷰어 JSON 형식) |
| `src/hsis/hsis.js` | HSIS 열 매핑, ARXML Port 파서, 일관성 검사, 추적성 |
| `src/hsis/sample-hsis.js` | 예제 HSIS와 ARXML |
| `src/app/hsisui.js` | HSIS 작업 공간 UI (빌드 시 viewer.js에 삽입) |
| `src/app/body.html`, `src/styles/` | 마크업과 스타일 |
