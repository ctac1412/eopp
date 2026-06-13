const COMPANY_ALIASES = {
  'ООО "АРТ-ТРАНС"': "Хип-Хоп Транс Дэнс",
};

export const REPORT_PRESETS = [
  { id: "all", label: "Все" },
  { id: "success", label: "Успешные" },
  { id: "errors", label: "Ошибки" },
  { id: "billing", label: "К счету" },
];

export function getOpType(record) {
  if (record.op_type === "create") return "Создание";
  if (record.op_type === "reschedule") return "Перенос";
  return "—";
}

export function getFio(record) {
  const fio = record.fio;
  if (!fio || typeof fio !== "string") return "—";
  return fio.trim().split(/\s+/).map((part) => `${part[0]}.`).join(" ");
}

export function getFioFull(record) {
  return record.fio || "—";
}

export function getCompany(record) {
  const name = record.company;
  if (!name) return "—";
  return COMPANY_ALIASES[name] || name;
}

export function getCompanyFull(record) {
  return record.company || "—";
}

export function getVehicleNumber(record, short = true) {
  const number = record.vehicle_number;
  if (!number) return "—";
  return short && number.length > 4 ? `${number.slice(0, 4)}....` : number;
}

export function getVehicleNumberFull(record) {
  return record.vehicle_number || "—";
}

export function isTestRecord(record) {
  return record.is_test === true || record.is_test === 1;
}

export function isBillableRecord(record) {
  if (isTestRecord(record)) return false;
  const hasPrice = record.price != null && record.price > 0;
  const isPaid = record.paid === true;
  return record.status === "confirmed" && hasPrice && !isPaid && !record.invoice_id;
}

export function hasMissingPrice(record) {
  return !isTestRecord(record) && record.status === "confirmed" && !(record.price > 0);
}

export function getSearchText(record) {
  return [
    record.id,
    record.label,
    record.api_key_id,
    record.reservation_id,
    record.captcha_id,
    record.error_message,
    record.error_stage,
    record.company,
    record.fio,
    record.vehicle_number,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function matchesPreset(record, preset) {
  if (preset === "success") return record.status === "confirmed";
  if (preset === "errors") return record.status === "failed";
  if (preset === "billing") return isBillableRecord(record);
  return true;
}

export function groupByCompany(records) {
  const groups = {};
  records.forEach((record) => {
    const company = getCompany(record);
    if (!groups[company]) {
      groups[company] = {
        reschedule: 0,
        create: 0,
        errors: 0,
        readyForInvoice: 0,
        invoiceAmount: 0,
        records: [],
      };
    }
    groups[company].records.push(record);
    if (record.op_type === "reschedule") groups[company].reschedule++;
    if (record.op_type === "create") groups[company].create++;
    if (record.status === "failed") groups[company].errors++;
    if (isBillableRecord(record)) {
      groups[company].readyForInvoice++;
      groups[company].invoiceAmount += record.price || 0;
    }
  });
  return Object.entries(groups).map(([name, counts]) => ({ name, ...counts }));
}

const ERROR_STAGE_INFO = {
  slots: { category: "slots", label: "Не нашли слоты", tone: "danger", step: 1 },
  stage1: { category: "slots", label: "Не нашли слоты", tone: "danger", step: 1 },
  captcha: { category: "captcha", label: "Не получили капчу", tone: "danger", step: 2 },
  stage2: { category: "captcha", label: "Не получили капчу", tone: "danger", step: 2 },
  solving: { category: "captcha", label: "Не решили капчу", tone: "danger", step: 3 },
  stage3: { category: "captcha", label: "Не решили капчу", tone: "danger", step: 3 },
  validating: { category: "captcha", label: "Провалили капчу", tone: "danger", step: 4 },
  stage4: { category: "captcha", label: "Провалили капчу", tone: "danger", step: 4 },
  submitting: { category: "submit", label: "EOPP не принял запрос", tone: "danger", step: 5 },
  stage5: { category: "submit", label: "EOPP не принял запрос", tone: "danger", step: 5 },
  api: { category: "api", label: "EOPP отказал", tone: "danger" },
  server: { category: "server", label: "Сервер упал", tone: "danger" },
  network: { category: "network", label: "Не было сети", tone: "warning" },
  timeout: { category: "timeout", label: "Не дождались ответа", tone: "warning" },
  test: { category: "test", label: "Тест", tone: "secondary" },
  other: { category: "other", label: "Не распознали ошибку", tone: "secondary" },
};

function normalizeErrorText(value) {
  return String(value || "").trim().toLowerCase();
}

function inferErrorInfo(record) {
  const text = normalizeErrorText(`${record.error_message || ""} ${record.error_stage || ""}`);

  if (text.includes("429") || text.includes("too many requests")) {
    return { category: "eopp-limit", label: "Уперлись в лимит", tone: "warning" };
  }
  if (text.includes("captchanotexistfreetimeslot")) {
    return { category: "slot-lost", label: "Слот ушёл", tone: "warning", step: 4 };
  }
  if (text.includes("allslotsoccupiedoninterval") || text.includes("all slots occupied") || text.includes("all_slots")) {
    return { category: "slots", label: "Слот был занят", tone: "warning", step: 1 };
  }
  if (text.includes("timeout") || text.includes("тайм")) {
    return { category: "timeout", label: "Не дождались ответа", tone: "warning" };
  }
  if (text.includes("network") || text.includes("failed to fetch") || text.includes("fetch failed")) {
    return { category: "network", label: "Не было сети", tone: "warning" };
  }
  if (text.includes("401") || text.includes("403") || text.includes("api key") || text.includes("ключ")) {
    return { category: "auth", label: "Не было доступа", tone: "danger" };
  }
  if (text.includes("captcha") || text.includes("капч")) {
    return { category: "captcha", label: "Ошибка капчи", tone: "danger" };
  }
  if (text.includes("400")) {
    return { category: "api", label: "EOPP отклонил", tone: "danger" };
  }
  return null;
}

export function getErrorInfo(record) {
  if (!record || record.status !== "failed") {
    return { category: "none", label: "—", tone: "secondary" };
  }

  const stage = normalizeErrorText(record.error_stage);
  const knownStage = ERROR_STAGE_INFO[stage];
  if (knownStage && stage !== "other") {
    return { rawStage: record.error_stage, ...knownStage };
  }

  const inferred = inferErrorInfo(record);
  if (inferred) return { rawStage: record.error_stage, ...inferred };

  if (knownStage) return { rawStage: record.error_stage, ...knownStage };

  if (stage) {
    return {
      category: stage,
      label: record.error_stage,
      tone: "secondary",
      rawStage: record.error_stage,
    };
  }

  return { category: "other", label: "Не распознали ошибку", tone: "secondary" };
}

export function getErrorTagColor(errorInfo) {
  if (errorInfo.tone === "warning") return "warning";
  if (errorInfo.tone === "danger") return "error";
  if (errorInfo.tone === "success") return "success";
  return "default";
}

export function groupFailuresByCategory(records) {
  const groups = {};
  records
    .filter((record) => record.status === "failed")
    .forEach((record) => {
      const info = getErrorInfo(record);
      if (!groups[info.category]) {
        groups[info.category] = {
          ...info,
          count: 0,
          records: [],
          lastMessage: "",
        };
      }
      groups[info.category].count++;
      groups[info.category].records.push(record);
      if (!groups[info.category].lastMessage && record.error_message) {
        groups[info.category].lastMessage = record.error_message;
      }
    });

  return Object.values(groups).sort((a, b) => b.count - a.count);
}

export function getReadyForInvoiceCount(companyRecords) {
  return companyRecords.filter(isBillableRecord).length;
}

export function getStatusLabel(status) {
  if (status === "confirmed") return "Успех";
  if (status === "failed") return "Ошибка";
  if (status === "pending") return "В работе";
  return status || "—";
}
