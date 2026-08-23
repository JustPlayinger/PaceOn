export interface Runner {
  id: string
  name: string
  age?: number | null
  gender?: string | null
  weight?: number | null
  height?: number | null
  restingHr?: number | null
  maxHr?: number | null
  vo2max?: number | null
  experience?: string | null
  targetRace?: string | null
  targetDate?: string | null
  targetTime?: string | null
  weeklyMileage?: number | null
  notes?: string | null
}

export interface Completion {
  id: string
  sessionId: string
  distance?: number | null
  duration?: number | null
  avgPace?: string | null
  avgPaceSec?: number | null
  avgHr?: number | null
  maxHr?: number | null
  elevation?: number | null
  cadence?: number | null
  calories?: number | null
  weather?: string | null
  temperature?: number | null
  rpe?: number | null
  feeling?: number | null
  feelingNote?: string | null
  imageDataUrl?: string | null
  rawExtract?: string | null
  notes?: string | null
}

export interface Session {
  id: string
  weekId: string
  date: string
  dayOfWeek: number
  type: string
  plannedDistance?: number | null
  plannedDuration?: number | null
  plannedPace?: string | null
  intensity?: string | null
  description?: string
  status: string
  order: number
  completion?: Completion | null
}

export interface AIReview {
  id: string
  weekId?: string | null
  type: string
  content: string
  rating?: number | null
  suggestions?: string | null
  createdAt: string
}

export interface Plan {
  id: string
  title: string
  goal?: string | null
  targetRace?: string | null
  active: boolean
  startedAt: string
  createdAt: string
  updatedAt: string
  weeks?: Week[]
}

export interface Week {
  id: string
  planId?: string | null
  weekStart: string
  weekEnd: string
  weekNumber?: number | null
  phase?: string | null
  goal?: string | null
  summary?: string | null
  sessions: Session[]
  reviews?: AIReview[]
}
