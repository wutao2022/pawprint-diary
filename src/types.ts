export type Pet = {
  id: string;
  name: string;
  species: string;
  breed: string;
  sex: string;
  birth_date: string | null;
  home_date: string | null;
  color: string;
  initial_weight: number | null;
  target_weight_min: number | null;
  target_weight_max: number | null;
  neutered: number;
  neutered_date: string | null;
  microchip: string;
  allergies: string;
  chronic_conditions: string;
  long_term_medications: string;
  hospital: string;
  veterinarian: string;
  hospital_phone: string;
  owner_phone: string;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type PetPhoto = {
  id: string;
  pet_id: string;
  relative_path: string;
  position: number;
  is_primary: number;
  created_at: string;
};

export type CareCategory =
  | 'vaccine'
  | 'deworm_internal'
  | 'deworm_external'
  | 'medication'
  | 'checkup'
  | 'bath'
  | 'grooming'
  | 'nails'
  | 'dental'
  | 'ears'
  | 'custom';

export type CareSchedule = {
  id: string;
  pet_id: string;
  category: CareCategory;
  title: string;
  last_completed_date: string | null;
  due_date: string;
  recurrence_days: number | null;
  reminder_days: number;
  status: 'pending' | 'completed' | 'skipped';
  notes: string;
  hospital: string;
  cost: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type CareRecord = {
  id: string;
  schedule_id: string | null;
  pet_id: string;
  category: CareCategory;
  title: string;
  action: 'completed' | 'skipped';
  occurred_at: string;
  notes: string;
  cost: number | null;
  created_at: string;
  deleted_at: string | null;
};

export type HealthType = 'weight' | 'symptom' | 'visit' | 'medication' | 'daily';

export type HealthRecord = {
  id: string;
  pet_id: string;
  type: HealthType;
  occurred_at: string;
  title: string;
  weight: number | null;
  body_condition: number | null;
  symptoms: string;
  mood: string;
  appetite: string;
  water: string;
  stool: string;
  diagnosis: string;
  treatment: string;
  medication: string;
  dosage: string;
  frequency: string;
  course: string;
  cost: number | null;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  archived: number;
};

export type TimelineEntry = {
  id: string;
  pet_id: string;
  type: 'photo' | 'milestone' | 'birthday' | 'home_anniversary';
  occurred_at: string;
  title: string;
  note: string;
  location: string;
  relative_photo_path: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Attachment = {
  id: string;
  pet_id: string;
  owner_type: 'folder' | 'health' | 'care';
  owner_id: string | null;
  category: string;
  display_name: string;
  mime_type: string;
  relative_path: string;
  occurred_at: string;
  notes: string;
  created_at: string;
  deleted_at: string | null;
};

export type TrashItem = {
  id: string;
  entity_type: string;
  entity_id: string;
  payload_json: string;
  deleted_at: string;
  expires_at: string;
};

export type AppSnapshot = {
  pets: Pet[];
  photos: PetPhoto[];
  careSchedules: CareSchedule[];
  careRecords: CareRecord[];
  healthRecords: HealthRecord[];
  timeline: TimelineEntry[];
  attachments: Attachment[];
};

export type PetInput = Omit<Pet, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
export type CareInput = Omit<CareSchedule, 'id' | 'status' | 'created_at' | 'updated_at' | 'deleted_at'>;
export type HealthInput = Omit<HealthRecord, 'id' | 'created_at' | 'updated_at' | 'deleted_at' | 'archived'>;
export type TimelineInput = Omit<TimelineEntry, 'id' | 'created_at' | 'updated_at' | 'deleted_at'>;
