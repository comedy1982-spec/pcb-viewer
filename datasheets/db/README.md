# 데이터시트 HTML DB

부품마다 한 페이지(`<부품번호>.html`)로 실제 데이터시트의 핵심을 정리해 두는 폴더입니다. 2단계(회로)에서 오른쪽 **데이터시트** 탭이 이 페이지를 보여 주고, 회로 안 비교의 참고 단가도 여기(`data-price`)와 `src/parts/parts.js`의 값을 씁니다.

> **이 폴더의 .html은 생성 파일입니다.** 원본은 `datasheets/records/<부품>.json`이고 `node scripts/dsdb.mjs`가 이 페이지를 다시 씁니다.
> 형식·편집 방법은 [`datasheets/records/README.md`](../records/README.md)를 보세요.

페이지는 보통 HTML 문서라 브라우저에서 바로 열 수 있습니다. `db/index.json`은 부품 목록(제조사·분류·단가·상태)입니다.

- 데이터시트 PDF 원문은 저작권 때문에 저장소에 넣지 않습니다. 링크와 요약만 적습니다.

## 2026-10 업데이트

- 앱이 이름을 쓰는 부품(내장 DB · KiCad 핀 · 회로 생성 후보 · 제품 프로필) 249종을 데이터시트 원문으로 다시 정리했습니다: `done` 206 · `stub` 50.
  `stub` 페이지의 노란 칸에 빠진 항목과 이유(원문 PDF 차단, 본문이 긴 MCU 데이터시트의 전기적 특성 장 등)를 적었습니다.
- 데이터시트에서 옮긴 핀 표는 `datasheets/pins.json` → `node scripts/kicadpins.mjs --merge-only`로 `src/parts/kicadpins.js`에 합칩니다 (KiCad 라이브러리 일치분은 유지).
- 대조 중 찾은 부품 DB 문제는 `datasheets/REVIEW.md`에 있습니다.
