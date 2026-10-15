# 데이터시트

예제 보드(SENSE-32, MOTION-32 DEV, MOTION-32 BLDC)에 쓰인 부품의 제조사 데이터시트 링크와 주요 사양입니다. 뷰어에서는 부품을 클릭하면 같은 내용이 정보 패널에 나옵니다.

PDF 파일 자체는 저작권과 용량 때문에 저장소에 넣지 않았습니다. 인터넷이 되는 컴퓨터에서 아래 명령을 실행하면 `datasheets/pdf/`에 내려받고, 저장소의 `dist/index.html`을 파일로 열었을 때 부품 정보의 **저장된 사본** 버튼이 그 파일을 엽니다.

```
node scripts/datasheets.mjs --download
```

| 부품 번호 | 제조사 | 분류 | 설명 | 데이터시트 | 사용 보드 |
|---|---|---|---|---|---|
| STM32F042K6U6 | STMicroelectronics | MCU | STM32F042x4/x6 — Arm Cortex-M0 MCU, USB, CAN | [PDF](https://www.st.com/resource/en/datasheet/stm32f042k6.pdf) · [페이지](https://www.st.com/en/microcontrollers-microprocessors/stm32f042k6.html) | SENSE-32, MOTION-32 (DC·BLDC) |
| DRV8313PWPR | Texas Instruments | 모터 드라이버 | DRV8313 — 2.5 A triple half-bridge driver | [PDF](https://www.ti.com/lit/ds/symlink/drv8313.pdf) · [페이지](https://www.ti.com/product/DRV8313) | MOTION-32 (DC·BLDC) |
| AMS1117-3.3 | Advanced Monolithic Systems | 전원 | AMS1117 — 1 A low-dropout regulator | [PDF](http://www.advanced-monolithic.com/pdf/ds1117.pdf) · [페이지](http://www.advanced-monolithic.com/) | SENSE-32, MOTION-32 (DC·BLDC) |
| W25Q32JVSSIQ | Winbond | 메모리 | W25Q32JV — 3 V 32 Mbit serial NOR flash | [페이지](https://www.winbond.com/hq/product/code-storage-flash-memory/serial-nor-flash/?__locale=en&partNo=W25Q32JV) | SENSE-32 |
| AO3400A | Alpha & Omega Semiconductor | 트랜지스터 | AO3400A — 30 V N-channel MOSFET | [PDF](https://www.aosmd.com/res/datasheets/AO3400A.pdf) · [페이지](https://www.aosmd.com/products/mosfets/low-voltage-mosfets/AO3400A) | MOTION-32 (DC·BLDC) |
| SS14 | Vishay | 다이오드 | SS12–SS16 — 1 A surface-mount Schottky rectifier | [PDF](https://www.vishay.com/docs/88746/ss12.pdf) | MOTION-32 (DC·BLDC) |
| APT1608SGC | Kingbright | LED | APT1608SGC — 0603 super bright green LED | [PDF](https://www.kingbrightusa.com/images/catalog/SPEC/APT1608SGC.pdf) | SENSE-32, MOTION-32 (DC·BLDC) |
| APT1608EC | Kingbright | LED | APT1608EC — 0603 high-efficiency red LED | [PDF](https://www.kingbrightusa.com/images/catalog/SPEC/APT1608EC.pdf) | MOTION-32 (DC·BLDC) |
| APT1608QBC/D | Kingbright | LED | APT1608QBC/D — 0603 blue LED | [PDF](https://www.kingbrightusa.com/images/catalog/SPEC/APT1608QBC-D.pdf) | MOTION-32 (DC·BLDC) |
| B3FS-1000P | Omron | 스위치 | B3FS — 6×6 mm SMT tactile switch | [PDF](https://omronfs.omron.com/en_US/ecb/products/pdf/en-b3fs.pdf) | SENSE-32 |
| 61300411121 | Würth Elektronik | 커넥터 | WR-PHD 2.54 mm pin header, 4 pins | [PDF](https://www.we-online.com/components/products/datasheet/61300411121.pdf) | SENSE-32 |
| 61300211121 | Würth Elektronik | 커넥터 | WR-PHD 2.54 mm pin header, 2 pins | [PDF](https://www.we-online.com/components/products/datasheet/61300211121.pdf) | MOTION-32 (DC·BLDC) |
| USB4105-GF-A | GCT | 커넥터 | USB4105 — USB Type-C 2.0 receptacle | [페이지](https://gct.co/connector/usb4105) | SENSE-32 |
| FA-130RA | Mabuchi Motor (Tamiya 판매) | 모터 | FA-130 brushed DC motor + Tamiya 70097 gearbox | [페이지](https://www.pololu.com/product/77/specs) | MOTION-32 (DC·BLDC) |
| 42BLF01 (MIKROE-4455) | MIKROE (42BLF 시리즈) | 모터 | 42BLF01 — 3-phase BLDC motor with hall sensors | [PDF](https://mouser.com/datasheet/2/272/BLDC_Motor_BLDC_Motor_with_Hall_sensor_Datasheet-3217747.pdf) · [페이지](https://www.mikroe.com/motor-bldc-42blf01-with-hall-sensor) | MOTION-32 (DC·BLDC) |
| CL21A106KAYNNNE | Samsung Electro-Mechanics | 커패시터 | MLCC 10 µF 25 V X5R 0805 | [페이지](https://product.samsungsem.com/mlcc/CL21A106KAYNNN.do) | SENSE-32, MOTION-32 (DC·BLDC) |
| CL10B104KB8NNNC | Samsung Electro-Mechanics | 커패시터 | MLCC 100 nF 50 V X7R 0603 | [페이지](https://product.samsungsem.com/mlcc/CL10B104KB8NNN.do) | SENSE-32, MOTION-32 (DC·BLDC) |
| CL10B103KB8NNNC | Samsung Electro-Mechanics | 커패시터 | MLCC 10 nF 50 V X7R 0603 | [페이지](https://product.samsungsem.com/mlcc/CL10B103KB8NNN.do) | MOTION-32 (DC·BLDC) |
| CL10A105KB8NNNC | Samsung Electro-Mechanics | 커패시터 | MLCC 1 µF 50 V X5R 0603 | [페이지](https://product.samsungsem.com/mlcc/CL10A105KB8NNN.do) | MOTION-32 (DC·BLDC) |
| GRM31CR60J107ME39 | Murata | 커패시터 | MLCC 100 µF 6.3 V X5R 1206 | [페이지](https://www.murata.com/en-us/products/productdetail?partno=GRM31CR60J107ME39L) | MOTION-32 (DC·BLDC) |
| GRM32ER61E226KE15 | Murata | 커패시터 | MLCC 22 µF 25 V X5R 1210 | [페이지](https://www.murata.com/en-us/products/productdetail?partno=GRM32ER61E226KE15L) | MOTION-32 (DC·BLDC) |
| GRM188R71C474KA88D | Murata | 커패시터 | MLCC 0.47 µF 16 V X7R 0603 | [페이지](https://www.murata.com/en-us/products/productdetail?partno=GRM188R71C474KA88D) | MOTION-32 (DC·BLDC) |
| TC364DP-64F300F | Infineon | MCU | AURIX TC36x — 32-bit TriCore automotive MCU, 300 MHz | [PDF](https://www.infineon.com/dgdl/Infineon-SAK-TC36xDP-DataSheet-v01_01-EN.pdf?fileId=5546d46274dd77260174e8c7c7bf34b1) |  |
| TLE9251VSJ | Infineon | CAN 트랜시버 | TLE9251V — high-speed CAN FD transceiver with VIO | [페이지](https://www.infineon.com/cms/en/product/interface/automotive-transceiver/automotive-can-transceivers/tle9251vsj/) |  |
| AMS1117-5.0 | Advanced Monolithic Systems | 전원 | AMS1117 — 1 A low-dropout regulator | [PDF](http://www.advanced-monolithic.com/pdf/ds1117.pdf) · [페이지](http://www.advanced-monolithic.com/) |  |
| ABM8-20.000MHZ-B2-T | Abracon | 크리스털 | ABM8 — 3.2×2.5 mm SMD crystal, 20 MHz | [PDF](https://abracon.com/Resonators/abm8.pdf) |  |
| 61300811121 | Würth Elektronik | 커넥터 | WR-PHD 2.54 mm pin header, 8 pins | [PDF](https://www.we-online.com/components/products/datasheet/61300811121.pdf) |  |
| RL1206FR-070R1L | Yageo | 저항 | RL series low-ohm chip resistor 0.1 Ω 1206 | [검색](https://octopart.com/search?q=RL1206FR-070R1L) | MOTION-32 (DC·BLDC) |
| RC0603FR-0710KL | Yageo | 저항 | RC series thick-film chip resistor 0603 | [검색](https://octopart.com/search?q=RC0603FR-0710KL) | SENSE-32, MOTION-32 (DC·BLDC) |
| RC0603FR-07330RL | Yageo | 저항 | RC series thick-film chip resistor 0603 | [검색](https://octopart.com/search?q=RC0603FR-07330RL) | SENSE-32, MOTION-32 (DC·BLDC) |
| RC0603FR-074K7L | Yageo | 저항 | RC series thick-film chip resistor 0603 | [검색](https://octopart.com/search?q=RC0603FR-074K7L) | SENSE-32 |
| RC0603FR-075K1L | Yageo | 저항 | RC series thick-film chip resistor 0603 | [검색](https://octopart.com/search?q=RC0603FR-075K1L) | SENSE-32 |
| RC0603FR-07100RL | Yageo | 저항 | RC series thick-film chip resistor 0603 | [검색](https://octopart.com/search?q=RC0603FR-07100RL) | MOTION-32 (DC·BLDC) |
| RC0603FR-07680RL | Yageo | 저항 | RC series thick-film chip resistor 0603 | [검색](https://octopart.com/search?q=RC0603FR-07680RL) | MOTION-32 (DC·BLDC) |

## 주요 사양

### STM32F042K6U6 — STMicroelectronics

- **코어**: Arm Cortex-M0, 최대 48 MHz
- **메모리**: 플래시 32 KB · SRAM 6 KB
- **전원**: VDD 2.0–3.6 V · VDDA ≤ 3.6 V (ADC 사용 시 ≥ 2.4 V) · VDDIO2 1.65–3.6 V
- **USB**: USB 2.0 FS, 크리스털리스 (HSI48 + CRS) · PA11 DM / PA12 DP
- **타이머**: TIM1 고급 제어 (CH1–CH4: PA8–PA11) 외
- **ADC**: 12비트, ADC_IN0–9 (PA0–PA7, PB0, PB1)
- **패키지**: UFQFPN32 5×5 mm · 노출 패드 = VSS · 31번 BOOT0
- **디버그**: SWD: PA13 SWDIO / PA14 SWCLK

### DRV8313PWPR — Texas Instruments

- **VM**: 8–60 V (절대 최대 65 V)
- **출력**: 상당 2.5 A 피크 · 과전류 3 A 최소
- **RDS(on)**: 0.24 Ω typ (상단·하단 각, 25 °C)
- **입력 논리**: ENx=0 → OUTx 하이 임피던스 · ENx=1, INx=1 → H · INx=0 → L
- **보호**: 과전류·과열·저전압 → nFAULT (오픈 드레인, 외부 풀업)
- **기타**: nSLEEP·nRESET 내부 풀다운 · V3P3 3.3 V 10 mA · 차지 펌프 (CPH–CPL 0.01 µF, VCP–VM 0.1 µF)
- **패키지**: HTSSOP-28 (PWP), 써멀 패드 GND

### AMS1117-3.3 — Advanced Monolithic Systems

- **출력**: 3.3 V 고정, 최대 1 A
- **드롭아웃**: 약 1.1 V (1 A)
- **입력**: 최대 15 V
- **패키지**: SOT-223: 1 GND · 2 VOUT · 3 VIN · 탭 VOUT

### W25Q32JVSSIQ — Winbond

- **용량**: 32 Mbit (4 MB)
- **전원**: 2.7–3.6 V
- **인터페이스**: SPI / Dual / Quad SPI, 최대 133 MHz
- **패키지**: SOIC-8 208 mil: 1 /CS · 2 DO · 3 /WP · 4 GND · 5 DI · 6 CLK · 7 /HOLD · 8 VCC

### AO3400A — Alpha & Omega Semiconductor

- **VDS**: 30 V
- **ID**: 5.7 A (VGS 10 V)
- **RDS(on)**: 19 mΩ typ @ 4.5 V · 24 mΩ typ @ 2.5 V
- **VGS(th)**: 1.05 V typ (0.65–1.45 V)
- **패키지**: SOT-23: 1 G · 2 S · 3 D

### SS14 — Vishay

- **VRRM**: 40 V (SS14)
- **IF(AV)**: 1.0 A
- **패키지**: SMA (DO-214AC), 띠 = 캐소드

### APT1608SGC — Kingbright

- **색**: 녹색 568 nm (dominant)
- **VF**: 2.2 V typ @ 20 mA
- **IF**: 최대 25 mA DC
- **패키지**: 0603 (1.6×0.8 mm)

### APT1608EC — Kingbright

- **색**: 적색 617 nm (dominant)
- **VF**: 2.0 V typ @ 20 mA
- **IF**: 최대 30 mA DC
- **패키지**: 0603

### APT1608QBC/D — Kingbright

- **색**: 청색 465 nm (dominant)
- **VF**: 3.3 V typ @ 20 mA (최대 4.0 V)
- **패키지**: 0603

### B3FS-1000P — Omron

- **크기**: 6×6 mm, 플런저 3.1 mm
- **작동력**: 0.98 N (100 gf)
- **정격**: 1–50 mA, 3–24 VDC

### 61300411121 — Würth Elektronik

- **피치**: 2.54 mm
- **핀**: 1×4, 스루홀
- **정격**: 3 A, 250 V AC

### 61300211121 — Würth Elektronik

- **피치**: 2.54 mm
- **핀**: 1×2, 스루홀
- **정격**: 3 A, 250 V AC

### FA-130RA — Mabuchi Motor (Tamiya 판매)

- **정격**: 3 V
- **무부하**: 12,300 rpm, 150 mA (3 V)
- **구속**: 2.1 A, 0.5 oz·in ≈ 3.5 mN·m (3 V)
- **기어박스**: Tamiya 70097 Twin-Motor Gearbox, 58:1 또는 203:1 (예제는 58:1)
- **시뮬레이션 값**: R 1.43 Ω, ke = kt 2.16 mV/(rad/s), 마찰 0.32 mN·m — 위 정격에서 계산

> 제조사 PDF 대신 Pololu 사양 페이지(유통사) 링크입니다.

### 42BLF01 (MIKROE-4455) — MIKROE (42BLF 시리즈)

- **정격**: 24 V, 4000 rpm, 1.9 A
- **극수**: 8극 (4극쌍), Y결선
- **토크 상수**: 0.035 N·m/A
- **역기전력 상수**: 3.7 V/krpm
- **회전자 관성**: 24 g·cm²
- **홀 센서**: 120°, 전원 5–20 V
- **시뮬레이션 값**: 상 저항 0.9 Ω·인덕턴스 1.3 mH는 추정값 (데이터시트에 없음), 예제는 12 V 구동

> Mouser가 호스팅한 데이터시트 PDF입니다.

### TC364DP-64F300F — Infineon

- **코어**: TriCore, 최대 300 MHz (TC36x)
- **ADC**: EVADC 주 그룹 4개/32채널 + 보조 그룹 2개/32채널, EDSADC
- **타이머**: GTM (TOUT 출력, TIM 입력 캡처), CCU6, GPT12
- **통신**: MCMCAN (CAN FD) CAN0x·CAN1x, QSPI0–3, ASCLIN0–11, I2C0, E-Ray, GETH
- **포트 출력**: 핀마다 ALT1–ALT7 출력 선택 (Pn_IOCR.PCx), 입력은 주변장치 쪽 입력 선택(A/B/…)
- **패키지**: TQFP-144 (SAK-TC364DP-64F300F) · 노출 패드 VSS
- **디버그**: JTAG/DAP: TMS 89, TCK 92, TRST 91, P21.6 TDI, P21.7 TDO

> 두 번째 링크는 변형별 사양(패키지·메모리) 문서입니다.

### TLE9251VSJ — Infineon

- **속도**: 최대 5 Mbit/s (CAN FD)
- **전원**: VCC 5 V (송신부) · VIO 3.3 V/5 V (MCU 인터페이스)
- **모드**: STB High = 대기 (내부 풀업), Low = 정상 동작 · 대기 중 버스 웨이크업
- **패키지**: PG-DSO-8: 1 TxD · 2 GND · 3 VCC · 4 RxD · 5 VIO · 6 CANL · 7 CANH · 8 STB

### AMS1117-5.0 — Advanced Monolithic Systems

- **출력**: 5.0 V 고정, 최대 1 A
- **드롭아웃**: 약 1.1 V (1 A)
- **입력**: 최대 15 V
- **패키지**: SOT-223: 1 GND · 2 VOUT · 3 VIN · 탭 VOUT

### 61300811121 — Würth Elektronik

- **피치**: 2.54 mm
- **핀**: 1×8, 스루홀
- **정격**: 3 A, 250 V AC

### RC0603FR-0710KL — Yageo

- **값**: 10 kΩ
- **정밀도**: ±1 %
- **크기**: 0603, 1/10 W

### RC0603FR-07330RL — Yageo

- **값**: 330 Ω
- **정밀도**: ±1 %
- **크기**: 0603, 1/10 W

### RC0603FR-074K7L — Yageo

- **값**: 4.7 kΩ
- **정밀도**: ±1 %
- **크기**: 0603, 1/10 W

### RC0603FR-075K1L — Yageo

- **값**: 5.1 kΩ
- **정밀도**: ±1 %
- **크기**: 0603, 1/10 W

### RC0603FR-07100RL — Yageo

- **값**: 100 Ω
- **정밀도**: ±1 %
- **크기**: 0603, 1/10 W

### RC0603FR-07680RL — Yageo

- **값**: 680 Ω
- **정밀도**: ±1 %
- **크기**: 0603, 1/10 W
