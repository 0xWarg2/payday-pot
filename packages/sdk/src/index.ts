export const SDK_VERSION = "0.1.0";

export {
  type MatrixRow,
  type PotError,
  type PotErrorCode,
  type RecoveryAction,
  ALL_CONTRACT_ERROR_SPECS,
  ALL_FOREIGN_ERROR_SPECS,
  FOREIGN_ERROR_ABI,
  classifyError,
} from "./errors.js";

export {
  type AccountState,
  type EncryptedHandle,
  type EpochPhase,
  type PendingWork,
  type PotConfig,
  type PotState,
  EPOCH_PHASES,
  HIDDEN_HANDLE,
  MAX_BATCH_STEPS,
  getPot,
  isUninitialized,
  pendingWork,
  phaseFromUint8,
  readAccount,
  readPotConfig,
  readPotState,
} from "./pot.js";
