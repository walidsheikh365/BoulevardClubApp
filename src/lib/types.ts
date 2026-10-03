export type Role = "admin" | "facility_manager" | "family_member";
export type Profile = {
  id: string;
  full_name: string;
  role: Role;
  is_active: boolean;
};
export type Facility = {
  id: string;
  name: string;
  sport: "padel" | "football";
  is_active: boolean;
};
export type Booking = {
  id: string;
  facility_id: string;
  created_by: string;
  responsible_member_id: string;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled";
  guest_notes: string;
  created_at: string;
  updated_at: string;
};
export type BookingPlayer = { booking_id: string; user_id: string };
export type FacilityBlock = {
  id: string;
  facility_id: string;
  created_by: string;
  start_time: string;
  end_time: string;
  reason: string;
};
export type AuditLog = {
  id: string;
  action_by: string;
  action_type: string;
  details: string;
  created_at: string;
};
export type ClubData = {
  profiles: Profile[];
  facilities: Facility[];
  bookings: Booking[];
  booking_players: BookingPlayer[];
  facility_blocks: FacilityBlock[];
  audit_logs: AuditLog[];
};
export type BookingInput = {
  id?: string;
  facility_id: string;
  responsible_member_id: string;
  start_time: string;
  guest_notes: string;
  player_ids: string[];
  attendance_confirmed: boolean;
};

type Table<Row> = {
  Row: Row;
  Insert: Partial<Row>;
  Update: Partial<Row>;
  Relationships: [];
};
export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>;
      facilities: Table<Facility>;
      bookings: Table<Booking>;
      booking_players: Table<BookingPlayer>;
      facility_blocks: Table<FacilityBlock>;
      audit_logs: Table<AuditLog>;
    };
    Views: Record<string, never>;
    Functions: {
      save_booking: {
        Args: {
          p_id: string | null;
          p_facility_id: string;
          p_responsible_member_id: string;
          p_start_time: string;
          p_guest_notes: string;
          p_player_ids: string[];
          p_attendance_confirmed: boolean;
        };
        Returns: string;
      };
      cancel_booking: { Args: { p_id: string }; Returns: undefined };
      set_facility_active: { Args: { p_id: string; p_active: boolean }; Returns: undefined };
      set_member_access: { Args: { p_id: string; p_active: boolean; p_role: Role }; Returns: undefined };
      add_facility_block: {
        Args: { p_facility_id: string; p_start_time: string; p_end_time: string; p_reason: string };
        Returns: string;
      };
      remove_facility_block: { Args: { p_id: string }; Returns: undefined };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
