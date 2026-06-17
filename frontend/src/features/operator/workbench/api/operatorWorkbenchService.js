import { backend } from "../../../../shared/api/backend";

export const operatorWorkbenchService = {
  masters: (uuid) => backend.operator.masters(uuid),
  sendChat: (payload) => backend.operator.sendChat(payload),
  answerDistribution: (payload) => backend.operator.answerDistribution(payload),
};
