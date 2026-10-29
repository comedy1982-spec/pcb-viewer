# 데이터시트 HTML DB

부품마다 한 페이지(`<부품번호>.html`)로 실제 데이터시트의 핵심을 정리해 두는 폴더입니다. 2단계(회로)에서 오른쪽 **데이터시트** 탭이 이 페이지를 보여 주고, 회로 안 비교의 참고 단가도 여기(`data-price`)와 `src/parts/parts.js`의 값을 씁니다.

```
node scripts/dsdb.mjs --init   # parts.js에 있는 부품 중 페이지가 없는 것을 초안으로 생성
node scripts/dsdb.mjs          # 페이지를 src/parts/dsdb.js로 묶음 (npm run build가 먼저 실행함)
```

## 페이지 형식

파일 전체는 보통 HTML 문서라 브라우저에서 바로 열 수 있고, 앱은 `<article>` 안만 가져옵니다.

```html
<article data-mpn="STM32F042K6U6" data-mfr="STMicroelectronics" data-cat="MCU" data-price="2.6" data-status="done">
  <h1>STM32F042K6U6</h1>
  <p class="meta">제조사 · 분류 · 한 줄 설명 · 원본 링크</p>
  <h2>핵심 사양</h2> <dl><dt>코어</dt><dd>…</dd></dl>
  <h2>절대 최대 정격</h2> <table>…</table>
  <h2>권장 동작 조건</h2> <table>…</table>
  <h2>핀 배치</h2> <table>…</table>
  <h2>응용 회로 · 주변 부품</h2> <ul>…</ul>
  <h2>패키지 · 열</h2> <p>…</p>
  <h2>설계 메모</h2> <ul>…</ul>
</article>
```

- `data-mpn`: 부품 번호(보드·BOM의 mpn과 같아야 연결됨) · `data-alias`(선택): 같은 데이터시트를 쓰는 주문 코드 패턴, 공백으로 구분·`*` 와일드카드 (예: `RC0402FR-07*L RC0402JR-07*L` — Yageo RC_L 저항 전체가 RC0402 페이지로 연결) · `data-src`: 요약에 실제로 읽은 문서 URL · `data-mfr`: 제조사 · `data-cat`: 분류 · `data-price`: 참고 단가(USD, 약 1k 수량) · `data-status`: `stub`(초안) / `done`(검토 완료).
- 제목(`h2`)은 자유롭게 늘려도 됩니다. 표·목록·그림(`<img src="…">` 상대 경로, 같은 폴더)을 쓸 수 있습니다. 스크립트는 넣지 마세요(앱에서 제거됩니다).
- 데이터시트 PDF 원문은 저작권 때문에 저장소에 넣지 않습니다. 링크와 요약만 적습니다.

## 2026-10 업데이트

- 앱이 이름을 쓰는 부품(내장 DB · KiCad 핀 · 회로 생성 후보 · 제품 프로필) 249종을 데이터시트 원문으로 다시 정리했습니다: `done` 206 · `stub` 50.
  `stub` 페이지의 노란 칸에 빠진 항목과 이유(원문 PDF 차단, 본문이 긴 MCU 데이터시트의 전기적 특성 장 등)를 적었습니다.
- 데이터시트에서 옮긴 핀 표는 `datasheets/pins.json` → `node scripts/kicadpins.mjs --merge-only`로 `src/parts/kicadpins.js`에 합칩니다 (KiCad 라이브러리 일치분은 유지).
- 대조 중 찾은 부품 DB 문제는 `datasheets/REVIEW.md`에 있습니다.
