import CheckCircleOutlineRounded from '@mui/icons-material/CheckCircleOutlineRounded';
import DoNotDisturbOnRounded from '@mui/icons-material/DoNotDisturbOnRounded';
import ErrorOutlineRounded from '@mui/icons-material/ErrorOutlineRounded';
import InfoOutlined from '@mui/icons-material/InfoOutlined';
import WarningAmberRounded from '@mui/icons-material/WarningAmberRounded';

/** Distinct glyph per level so risk is legible without colour. */
export const RISK_ICON = {
  0: CheckCircleOutlineRounded,
  1: InfoOutlined,
  2: WarningAmberRounded,
  3: ErrorOutlineRounded,
  4: DoNotDisturbOnRounded,
} as const;
