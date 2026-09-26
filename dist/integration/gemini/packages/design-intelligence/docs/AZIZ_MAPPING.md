# وثيقة توجيه تكامل محرك عزيز (AZIZ Contract Mapping Specification)
### حزمة `@mizan/design-intelligence` -> محرك `AZIZ`

---

## 1. مبادئ التكامل المعتمدة

1. **الاستقلالية**: تحتفظ حزمة `@mizan/design-intelligence` بعقدها المعتمد `DesignIntelligenceResult` دون أي تعديل أو تشويه.
2. **صلاحية الـ Adapter**: يُبنى محول العقود (Adapter) في طبقة التكامل العليا أو داخل محرك AZIZ بواسطة مدير التكامل، دون فرض كود محول استباقي غير مثبت.
3. **عدم مساس كود AZIZ الحالي**: لا يتم تعديل أي ملف في حزم `aziz`، `design-core`، أو `engineering-core`.

---

## 2. خريطة مطابقة الحقول (Field Mapping Matrix)

عندما يعتمد مدير التكامل عقد AZIZ النهائي (`EngineOutputContract` و `DesignCandidate[]`)، توضح المصفوفة التالية آلية التحويل الحتمية:

| حقل مخرج DesignIntelligenceResult | الحقل المقابل في عقد AZIZ المستهدف | نوع البيانات | الملاحظات وقواعد التحويل |
| :--- | :--- | :--- | :--- |
| `requestId` | `contextId` / `sessionTraceId` | `string` | مطابقة تتبع موحدة عبر المنصة |
| `engineId` & `engineVersion` | `metadata.sourceEngine` | `string` | إثبات المصدر لـ `@mizan/design-intelligence` |
| `candidateStrategies[0].patternId` | `candidate.typologyRef` | `string` | المعرف المرجعي للنمط المعماري |
| `candidateStrategies[0].name` | `candidate.title` | `string` | اسم النمط باللغة العربية أو الإنجليزية |
| `candidateStrategies[0].matchScore` | `candidate.scoring.feasibilityScore` | `number [0-1]` | درجة التوافق المركبة |
| `candidateStrategies[0].dimensionalScores` | `candidate.scoring.subScores` | `object` | تفصيل الدرجات الـ 11 |
| `candidateStrategies[0].zones` | `candidate.spatialProgram.requiredZones` | `string[]` | المناطق الوظيفية المستهدفة للحل |
| `candidateStrategies[0].recommendedMicroPatterns`| `candidate.spatialProgram.subSystems` | `string[]` | الأنماط الفرعية المقترحة (المجلس، المطبخ، جناح الوالدة) |
| `candidateStrategies[0].circulationStrategy` | `candidate.layoutNarrative.circulation` | `string` | التوجيه المورفولوجي لمسارات الحركة |
| `candidateStrategies[0].privacyStrategy` | `candidate.layoutNarrative.privacy` | `string` | آلية تحقيق الخصوصية والعزل |
| `candidateStrategies[0].serviceStrategy` | `candidate.layoutNarrative.service` | `string` | استراتيجية تخديم المطبخ والمرافق |
| `candidateStrategies[1..N]` | `alternativeCandidates: DesignCandidate[]` | `Array` | البدائل المتنوعة للمفاضلة والاستكشاف |
| `diversityAnalysis.overallDiversityScore` | `explorationMetrics.diversityIndex` | `number` | مؤشر تباعد البدائل الحقيقي |
| `conflicts` | `validationFeedback.detectedHardConflicts` | `Array` | التعارضات الصريحة مع التوصيات |
| `assumptions` | `executionReport.assumptions` | `string[]` | الافتراضات الهندسية المسجلة صراحة |
| `warnings` | `executionReport.warnings` | `string[]` | التنبيهات المورفولوجية والبيئية |
| `executionMetadata.deterministicHash` | `executionReport.auditHash` | `string` | بصمة التشغيل الحتمية لضمان القابلية للتكرار |

---

## 3. التعامل مع سوابق الصور والمخططات

* أي مرجع تصويري أو تخطيطي مسترجع من السوابق المرجعية يظل موسوماً بـ `isEngineeringTruth: false`.
* لا يُسمح لمحرك AZIZ بترجمة مخرجات الصور إلى محددات هندسية تنفيذية، بل تُستخدم فقط كـ `VisualStyleReference` أو إلهام معماري للعميل.
