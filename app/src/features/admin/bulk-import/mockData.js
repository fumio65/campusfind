// Mock rows shaped after bulk_import_rows in 0001_init_schema.sql.
// This feature has no real api.js yet — FR-1's all-or-nothing CSV
// validation needs an Express endpoint, not a direct Supabase client call,
// so this stays mock-only until that service exists.
export const mockBulkImportRows = [
  { id: '1', student_id: '23-00142', enrollment_number: '2023110487', last_name: 'Reyes', first_name: 'Anna', csv_status: 'New', action: 'create', error_message: null },
  { id: '2', student_id: '23-00143', enrollment_number: '2023110488', last_name: 'Lopez', first_name: 'Mark', csv_status: 'New', action: 'create', error_message: null },
  { id: '3', student_id: '22-00098', enrollment_number: '2022109832', last_name: 'Santos', first_name: 'Jay', csv_status: 'Continuing', action: 'create', error_message: null },
  { id: '4', student_id: '19-00211', enrollment_number: '2019100223', last_name: 'Cruz', first_name: 'Liza', csv_status: 'Graduate', action: 'deactivate', error_message: null },
  { id: '5', student_id: '21-00067', enrollment_number: '2021100223', last_name: 'Garcia', first_name: 'Noel', csv_status: 'Continuing', action: 'skip_duplicate', error_message: 'enrollment no. exists' },
  { id: '6', student_id: '23-1455', enrollment_number: '2023110', last_name: 'Dela Cruz', first_name: 'Sam', csv_status: 'New', action: 'error', error_message: 'bad student ID format, expected YY-NNNNN' },
]