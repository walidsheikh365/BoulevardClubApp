"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { browserClient, demoMode, supabaseConfigured } from "@/lib/supabase/browser";
import { createDemoData, DEMO_KEY, loadDemo } from "@/lib/demo";
import { changeReason, endTime, overlaps, validateBooking } from "@/lib/rules";
import { allRows } from "@/lib/pagination";
import type { BookingInput, ClubData, Profile, Role } from "@/lib/types";

const EMPTY: ClubData = { profiles: [], facilities: [], bookings: [], booking_players: [], facility_blocks: [], audit_logs: [] };
type ClubContextValue = {
  data: ClubData;
  user: Profile | null;
  loading: boolean;
  error: string;
  notice: string;
  connected: boolean;
  refresh: () => Promise<void>;
  notify: (message: string) => void;
  clearError: () => void;
  switchDemoUser: (id: string) => void;
  resetDemo: () => void;
  saveBooking: (input: BookingInput) => Promise<void>;
  cancelBooking: (id: string) => Promise<void>;
  setFacility: (id: string, active: boolean) => Promise<void>;
  setMember: (id: string, active: boolean, role: Role) => Promise<void>;
  addBlock: (facilityId: string, start: string, end: string, reason: string) => Promise<void>;
  removeBlock: (id: string) => Promise<void>;
  signOut: () => Promise<void>;
};
const ClubContext = createContext<ClubContextValue | null>(null);
export function useClub() {
  const context = useContext(ClubContext);
  if (!context) throw new Error("ClubProvider is required.");
  return context;
}
export function ClubProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<ClubData>(EMPTY);
  const [userId, setUserId] = useState<string | null>(demoMode ? "demo-walid" : null);
  const [loading, setLoading] = useState(demoMode || supabaseConfigured);
  const [error, setError] = useState(!demoMode && !supabaseConfigured ? "Live mode needs Supabase configuration. No sample data is shown unless demo mode is explicitly enabled." : "");
  const [notice, setNotice] = useState("");
  const [connected, setConnected] = useState(false);
  const loadId = useRef(0);
  const dataRef = useRef(data);
  const user = data.profiles.find((p) => p.id === userId) ?? null;

  const refresh = useCallback(async () => {
    const id = ++loadId.current;
    if (demoMode) {
      const snapshot = loadDemo();
      dataRef.current = snapshot;
      setData(snapshot);
      return;
    }
    if (!supabaseConfigured) throw new Error("Supabase is not configured. Follow the setup guide or explicitly enable demo mode.");
    const client = browserClient();
    const { data: { user: sessionUser }, error: authError } = await client.auth.getUser();
    if (id !== loadId.current) return;
    if (!sessionUser) {
      if (authError && authError.name !== "AuthSessionMissingError") throw new Error(authError.message);
      setUserId(null);
      setData(EMPTY);
      return;
    }
    const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
    const [profiles, facilities, bookings, blocks, logs] = await Promise.all([
      allRows((from, to) => client.from("profiles").select("*").order("id").range(from, to)),
      allRows((from, to) => client.from("facilities").select("*").order("id").range(from, to)),
      allRows((from, to) => client.from("bookings").select("*").gte("end_time", since).order("start_time").order("id").range(from, to)),
      allRows((from, to) => client.from("facility_blocks").select("*").gte("end_time", since).order("id").range(from, to)),
      client.from("audit_logs").select("*").order("created_at", { ascending: false }).limit(100)
    ]);
    const playerRequests = [];
    for (let from = 0; from < bookings.length; from += 100) {
      const bookingIds = bookings.slice(from, from + 100).map((b) => b.id);
      playerRequests.push(allRows((start, end) => client.from("booking_players").select("*")
        .in("booking_id", bookingIds).order("booking_id").order("user_id").range(start, end)));
    }
    const players = (await Promise.all(playerRequests)).flat();
    if (id !== loadId.current) return;
    if (logs.error) throw new Error(logs.error.message);
    const profile = profiles.find((p) => p.id === sessionUser.id);
    if (!profile?.is_active) {
      setData(EMPTY);
      setUserId(null);
      throw new Error("Your account is not an active club member. Contact the admin for an invitation or access.");
    }
    const snapshot: ClubData = {
      profiles, facilities, bookings, booking_players: players, facility_blocks: blocks, audit_logs: logs.data
    };
    dataRef.current = snapshot;
    setData(snapshot);
    setUserId(sessionUser.id);
  }, []);

  useEffect(() => {
    const report = (reason: unknown) => setError(reason instanceof Error ? reason.message : "The club data could not be loaded.");
    if (demoMode) {
      void Promise.resolve().then(refresh).catch(report).finally(() => setLoading(false));
      const sync = (event: StorageEvent) => {
        if (event.key === DEMO_KEY) void refresh().catch(report);
      };
      window.addEventListener("storage", sync);
      return () => window.removeEventListener("storage", sync);
    }
    if (!supabaseConfigured) return;
    const client = browserClient();
    void Promise.resolve().then(refresh).catch(report).finally(() => setLoading(false));
    const { data: subscription } = client.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        ++loadId.current;
        setData(EMPTY);
        setUserId(null);
      } else if (event !== "INITIAL_SESSION") {
        window.setTimeout(() => void refresh().catch(report), 0);
      }
    });
    const online = () => { void refresh().catch(report); };
    const offline = () => { setConnected(false); setError("You are offline. Reconnect before making or changing bookings."); };
    window.addEventListener("online", online);
    window.addEventListener("offline", offline);
    const polling = window.setInterval(online, 60_000);
    return () => {
      subscription.subscription.unsubscribe();
      window.removeEventListener("online", online);
      window.removeEventListener("offline", offline);
      window.clearInterval(polling);
    };
  }, [refresh]);

  useEffect(() => {
    if (demoMode || !supabaseConfigured || !userId) return;
    const client = browserClient();
    const channel = client.channel(`club-${userId}`).on("postgres_changes", { event: "*", schema: "public" }, () => {
      void refresh().catch((reason: Error) => setError(reason.message));
    }).subscribe((status) => {
      setConnected(status === "SUBSCRIBED");
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setError("Live updates are disconnected. The calendar refreshes every minute; refresh before booking.");
      }
    });
    return () => { void client.removeChannel(channel); };
  }, [refresh, userId]);

  function requireUser() {
    if (!user?.is_active) throw new Error("An active, invited account is required.");
    if (!navigator.onLine && !demoMode) throw new Error("You are offline. Reconnect to change bookings.");
    return user;
  }
  function requireAdmin() {
    const current = requireUser();
    if (current.role !== "admin") throw new Error("Admin access is required.");
    return current;
  }
  function saveDemo(next: ClubData, action: string, details: string) {
    const current = requireUser();
    const updated = {
      ...next,
      audit_logs: [{ id: crypto.randomUUID(), action_by: current.id, action_type: action, details, created_at: new Date().toISOString() }, ...next.audit_logs]
    };
    localStorage.setItem(DEMO_KEY, JSON.stringify(updated));
    dataRef.current = updated;
    setData(updated);
  }
  async function afterMutation(message: string) {
    setNotice(message);
    try {
      await refresh();
    } catch (reason) {
      setError(`${message} However, the calendar could not refresh: ${reason instanceof Error ? reason.message : "Unknown error"}. Refresh before making another change.`);
    }
  }
  async function saveBooking(input: BookingInput) {
    const current = requireUser();
    const snapshot = demoMode ? loadDemo() : dataRef.current;
    const reason = validateBooking(input, snapshot, current);
    if (reason) throw new Error(reason);
    if (demoMode) {
      const id = input.id ?? crypto.randomUUID();
      const previous = snapshot.bookings.find((b) => b.id === id);
      const now = new Date().toISOString();
      saveDemo({
        ...snapshot,
        bookings: [...snapshot.bookings.filter((b) => b.id !== id), {
          id, facility_id: input.facility_id, responsible_member_id: input.responsible_member_id,
          created_by: previous?.created_by ?? current.id, start_time: input.start_time,
          end_time: endTime(input.start_time), status: "confirmed", guest_notes: input.guest_notes,
          created_at: previous?.created_at ?? now, updated_at: now
        }],
        booking_players: [...snapshot.booking_players.filter((p) => p.booking_id !== id),
          ...input.player_ids.map((user_id) => ({ booking_id: id, user_id }))]
      }, input.id ? "BOOKING_UPDATED" : "BOOKING_CREATED", JSON.stringify(input));
    } else {
      const { error } = await browserClient().rpc("save_booking", {
        p_id: input.id ?? null, p_facility_id: input.facility_id,
        p_responsible_member_id: input.responsible_member_id, p_start_time: input.start_time,
        p_guest_notes: input.guest_notes, p_player_ids: input.player_ids,
        p_attendance_confirmed: input.attendance_confirmed
      });
      if (error) throw new Error(error.message);
    }
    await afterMutation(input.id ? "Your booking has been updated." : "You're booked. See you at the club.");
  }
  async function cancelBooking(id: string) {
    const current = requireUser();
    if (demoMode) {
      const snapshot = loadDemo();
      const booking = snapshot.bookings.find((b) => b.id === id);
      if (!booking) throw new Error("Booking not found.");
      const reason = changeReason(booking, current);
      if (reason) throw new Error(reason);
      saveDemo({
        ...snapshot, bookings: snapshot.bookings.map((b) => b.id === id ? { ...b, status: "cancelled", updated_at: new Date().toISOString() } : b)
      }, "BOOKING_CANCELLED", JSON.stringify(booking));
    } else {
      const { error } = await browserClient().rpc("cancel_booking", { p_id: id });
      if (error) throw new Error(error.message);
    }
    await afterMutation("Booking cancelled. The slot is available again.");
  }
  async function setFacility(id: string, active: boolean) {
    requireAdmin();
    if (demoMode) {
      const snapshot = loadDemo();
      if (!active && snapshot.bookings.some((b) => b.facility_id === id && b.status === "confirmed" && new Date(b.end_time) > new Date())) {
        throw new Error("Cancel upcoming bookings before deactivating this facility.");
      }
      saveDemo({ ...snapshot, facilities: snapshot.facilities.map((f) => f.id === id ? { ...f, is_active: active } : f) }, "FACILITY_UPDATED", `${id}: ${active}`);
    } else {
      const { error } = await browserClient().rpc("set_facility_active", { p_id: id, p_active: active });
      if (error) throw new Error(error.message);
    }
    await afterMutation("Facility access updated.");
  }
  async function setMember(id: string, active: boolean, role: Role) {
    const current = requireAdmin();
    if (demoMode) {
      const snapshot = loadDemo();
      if (id === current.id) throw new Error("Another admin must change your access.");
      if (!active && snapshot.bookings.some((b) => b.responsible_member_id === id && b.status === "confirmed" && new Date(b.end_time) > new Date())) {
        throw new Error("Cancel this member's upcoming bookings before deactivating their account.");
      }
      saveDemo({ ...snapshot, profiles: snapshot.profiles.map((p) => p.id === id ? { ...p, is_active: active, role } : p) }, "MEMBER_UPDATED", `${id}: ${role}, active: ${active}`);
    } else {
      const { error } = await browserClient().rpc("set_member_access", { p_id: id, p_active: active, p_role: role });
      if (error) throw new Error(error.message);
    }
    await afterMutation("Member access updated.");
  }
  async function addBlock(facilityId: string, start: string, end: string, reason: string) {
    const current = requireAdmin();
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end)) || new Date(end) <= new Date(start)
      || new Date(end) <= new Date() || !reason.trim() || reason.trim().length > 300) {
      throw new Error("Provide a valid future block and a reason (up to 300 characters).");
    }
    if (demoMode) {
      const snapshot = loadDemo();
      if (snapshot.bookings.some((b) => b.facility_id === facilityId && b.status === "confirmed" && overlaps(b.start_time, b.end_time, start, end))) {
        throw new Error("Cancel overlapping bookings before adding a maintenance block.");
      }
      if (snapshot.facility_blocks.some((b) => b.facility_id === facilityId && overlaps(b.start_time, b.end_time, start, end))) {
        throw new Error("This period already has a maintenance block.");
      }
      saveDemo({ ...snapshot, facility_blocks: [...snapshot.facility_blocks, {
        id: crypto.randomUUID(), facility_id: facilityId, created_by: current.id, start_time: start, end_time: end, reason: reason.trim()
      }] }, "BLOCK_CREATED", `${facilityId}: ${start} to ${end} - ${reason.trim()}`);
    } else {
      const { error } = await browserClient().rpc("add_facility_block", { p_facility_id: facilityId, p_start_time: start, p_end_time: end, p_reason: reason.trim() });
      if (error) throw new Error(error.message);
    }
    await afterMutation("Maintenance block added.");
  }
  async function removeBlock(id: string) {
    requireAdmin();
    if (demoMode) {
      const snapshot = loadDemo();
      saveDemo({ ...snapshot, facility_blocks: snapshot.facility_blocks.filter((b) => b.id !== id) }, "BLOCK_REMOVED", id);
    } else {
      const { error } = await browserClient().rpc("remove_facility_block", { p_id: id });
      if (error) throw new Error(error.message);
    }
    await afterMutation("Maintenance block removed.");
  }
  async function signOut() {
    if (demoMode) return;
    const { error } = await browserClient().auth.signOut();
    if (error) throw new Error(error.message);
    ++loadId.current;
    setData(EMPTY);
    setUserId(null);
  }
  function resetDemo() {
    try {
      const snapshot = createDemoData();
      localStorage.setItem(DEMO_KEY, JSON.stringify(snapshot));
      dataRef.current = snapshot;
      setData(snapshot);
      setUserId("demo-walid");
      setError("");
      setNotice("Sample bookings restored. No real bookings were affected.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Demo storage is unavailable.");
    }
  }
  return <ClubContext.Provider value={{
    data, user, loading, error, notice, connected, refresh, notify: setNotice, clearError: () => setError(""),
    switchDemoUser: (id) => { if (demoMode) setUserId(id); },
    resetDemo, saveBooking, cancelBooking, setFacility, setMember, addBlock, removeBlock, signOut
  }}>{children}</ClubContext.Provider>;
}
