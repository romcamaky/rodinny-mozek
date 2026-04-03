// Predefined need options — used for both selection UI and storage
export const MY_NEEDS_OPTIONS = [
  'cvičení',
  'procházka sama',
  'čtení',
  'spánek navíc',
  'čas s kamarádkou',
  'kreativní čas',
  'meditace/klid',
  'péče o sebe',
] as const

export const OUR_NEEDS_OPTIONS = [
  'večer bez telefonů',
  'procházka spolu',
  'rande / večeře',
  'společný film/seriál',
  'plánování (dovolená/budoucnost)',
  'rozhovor beze spěchu',
] as const

// A selected need — either from predefined list or custom "other"
export interface SelectedNeed {
  label: string // the need text
  isCustom: boolean // true if user typed it via "jiné"
}

// A scheduled time block for a need
export interface PlannedBlock {
  needLabel: string // which need this block is for
  day: string // e.g. "pondělí", "úterý", etc.
  timeSlot: string // e.g. "ráno", "odpoledne", "večer", or specific time
}

// Full check-in record
export interface WeeklyCheckin {
  id: string
  userId: string
  weekStart: string // ISO date string (Monday)
  myNeeds: SelectedNeed[]
  ourNeeds: SelectedNeed[]
  plannedBlocks: PlannedBlock[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

// Reflection on a past check-in
export interface WeeklyReflection {
  id: string
  userId: string
  checkinId: string
  myNeedsDone: string[] // labels of needs that were fulfilled
  ourNeedsDone: string[] // labels of needs that were fulfilled
  note: string | null
  reflectedAt: string
}

// A check-in paired with its optional reflection — used in history view
export interface CheckinWithReflection {
  checkin: WeeklyCheckin
  reflection: WeeklyReflection | null
}
