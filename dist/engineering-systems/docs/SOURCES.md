# المصادر وطريقة الاستناد

تاريخ المراجعة: 31 أكتوبر 2026. الروابط التالية مصادر أولية. لا تتضمن الحزمة نصوص الأكواد أو جداولها المحمية، ولا تدّعي تدقيق كل بند أو إثبات الإصدار المنطبق على مشروع بعينه.

## نطاقات الكود السعودي

| المرجع | المصدر الرسمي | الاستخدام في هذه الحزمة |
|---|---|---|
| SBC 401 — كهرباء | https://sbc.gov.sa/en/BC/Pages/BuildingCode/BCDetails.aspx?codeId=401&year=2024 | تحديد مرجعية التخصص؛ لا نقل جدول مقاطع أو حمايات |
| SBC 501 — ميكانيكا | https://sbc.gov.sa/En/BC/Pages/BuildingCode/BCDetails.aspx?codeId=501&year=2024 | تحديد نطاق الميكانيكا؛ لا ادعاء اكتمال التهوية أو اختيار الأجهزة |
| SBC 701 — تمديدات صحية | https://sbc.gov.sa/ar/BC/Pages/BuildingCode/BCDetails.aspx?codeId=701&year=2024 | تحديد مرجعية المياه والصرف والتهوية والأمطار |
| SBC 801 — حماية من الحرائق | https://www.sbc.gov.sa/ar/BC/Pages/BuildingCode/BCDetails.aspx?codeId=801&year=2024 | تحديد الحاجة لتصميم ومراجعة مستقلين للحريق |
| SBC 602 — طاقة المباني السكنية | https://sbc.gov.sa/En/BC/Pages/BuildingCode/BC.aspx?year=2024 | توجيه استكمال بيانات كفاءة وغلاف المبنى السكني |
| التصويبات والتحديثات | https://www.sbc.gov.sa/En/CodeUpdates/pages/codeupdates.aspx | على منفذ القاعدة التأكد من التحديثات والانطباق وقت التكامل |

هذه قراءة لصفحات النطاق والفهرس. لا توجد قاعدة نظامية مُنفّذة ومصدّقة بمجرد إدراج رابط. ملفات القيم التوضيحية ليست مصادر للاشتراطات.

## الحسابات والملفات

| معرف المصدر | المصدر | ما يدعم، وما لا يُستنتج منه |
|---|---|---|
| SCHNEIDER-POWER | [Definition of reactive power](https://www.electrical-installation.org/enwiki/Definition_of_reactive_power) | علاقات القدرة الفعالة وغير الفعالة والظاهرة وعامل القدرة والتيار، مع فرض موجات جيبية وأحمال متزنة عند استعمال صيغة الثلاثة أطوار |
| SCHNEIDER-VOLTAGE-DROP | [Calculation of voltage drop in steady load conditions](https://www.electrical-installation.org/enwiki/Calculation_of_voltage_drop_in_steady_load_conditions) | صيغة R/X والتمييز بين طول كيلومتري واتجاه واحد وأحادي/ثلاثي الطور؛ قيم أمثلة الصفحة وحدودها ليست حدودًا سعودية للحزمة |
| LIGHTING-MANUAL | [Australian Government Energy Rating — Lighting Manual](https://www.energyrating.gov.au/sites/default/files/2022-12/Lighting%20Manual%20-%20Main%20Body%20-%20Final%20ex%20Appendices.pdf) | طريقة اللومن ومعامل الاستفادة وافتراضات توزيع الإنارة؛ لا إثبات فوتومتري لمواقع الاقتراح |
| CIBSE-LIGHTING-CONTENTS | [SLL Code for Lighting — public contents](https://www.cibse.org/knowledge-research/knowledge-portal/sll-code-for-lighting/) | بيان وجود موضوعات الفوتومتري ومعاملات الصيانة والاستفادة؛ لم يُشترَ أو يُنسخ الكتاب الكامل |
| ENERGYPLUS-HEAT-BALANCE | [EnergyPlus Engineering Reference — Zone Design Loads and Air Flow Rates, v26.2.0](https://energyplus.readthedocs.io/en/v26.2.0/guides/engineering-reference/10.3-zone-design-loads-and-air-flow-rates.html) | يوضح الفرق بين حمل التصميم الحسي/الكامن ومحاكاة توازن الحرارة. دالة الحزمة الساكنة تبسيط فيزيائي خاص **وليست تنفيذ EnergyPlus** |
| ASHRAE-ZONE-OA | [ASHRAE introduction to IAQ and Standard 62.1 — training material](https://www.ashrae.org/File%20Library/Professional%20Development/Learning%20Portal/Instructor-Led%20Training/Middle%20East%20Training%20Center/FINAL_Introduction-to-IAQ-and-Standard-62.1--MENA-_Oct-2020.pdf) | شكل جمع مساهمة الأشخاص والمساحة للمنطقة؛ لا نقل جدول معدلات أو فرض 62.1 على فيلا سكنية |
| HI-SYSTEM-CURVES | [Hydraulic Institute — Pump System Curves](https://datatool.pumps.org/pump-fundamentals/sys-curves) | خلفية الارتفاع والاحتكاك وعلاقة Darcy-Weisbach؛ الحزمة تستقبل معامل الاحتكاك ولا تحل اختيار المضخة أو الشبكة كاملة |
| AUTODESK-DXF | [HEADER Section Group Codes — DXF](https://help.autodesk.com/cloudhelp/2024/ENU/AutoCAD-DXF/files/GUID-A85E8E67-27CD-4C59-BE61-4DC9FADBE74A.htm) | قيمة وحدة المتر 6 في INSUNITS. فحص ezdxf لا يساوي اعتماد تبادل مع AutoCAD أو Revit |

الأمطار والتخزين وتسخين المياه واستمرارية التدفق وميل الأنبوب حسابات فيزيائية ظاهرة في المصدر ومختبرة بقيم مستقلة. الشدة المطرية والاستهلاك اليومي والكفاءة والتدفق والميل ليست قيما نظامية مزروعة؛ تحتاج بيانات ومرجع مشروع.

## مصدر واجهات الميزان

المستودع: https://github.com/azizaljery/Almizan-alhandasi

رأس `dev/sharaa-v2` المقروء لهذه المهمة: `429098abd38f0da24bbcf084dd25d4a37779b9c5`.

قُرئت واجهات `draw/doc.mjs` و`draw/digest.mjs` و`draw/topology.mjs` و`draw/geom.mjs` و`draw/catalog.mjs` و`draw/samples.mjs`، و`claude/PlannerOutputContract.mjs` و`claude/planner.mjs`، ومحوّل MIZAN-IR وعقده المرجعي، وبدايتا مولدي الفيلا v2/v3 لتحديد صيغة خروجهما. يضم تقرير الفحص بصمات ملفات التنفيذ التي شُغّلت. لم يُجرَ تدقيق شامل للمستودع ولم تُشغّل جميع اختبارات المنتج هنا.
