import React, { useState, useEffect, useCallback } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { startOfWeek, addWeeks, subWeeks, format, subDays, isSameDay } from "date-fns";
import WeekNav from "../components/dashboard/WeekNav";
import CalendarGrid from "../components/dashboard/CalendarGrid";
import DayView from "../components/dashboard/DayView";
import AddShiftModal from "../components/dashboard/AddShiftModal";
import DataControls from "../components/dashboard/DataControls";
import TimeOffModal from "../components/dashboard/TimeOffModal";
import AddEditEventModal from "../components/events/AddEditEventModal";
import { Loader2, GripVertical, Check, X } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

const EMPLOYEE_COLORS = [
  "#FF8C00", "#3B82F6", "#10B981", "#8B5CF6",
  "#EC4899", "#F59E0B", "#06B6D4", "#EF4444",
  "#6366F1", "#14B8A6", "#F97316", "#84CC16",
];

// Store hours for test data:
// Thu/Fri/Sat: 10am-3am (next day) - shifts end by 3am
// All other days: 10am-12am (midnight)
// Default store settings: 9am open, 5am close (Thu/Fri/Sat), 9am open, 2am close (others)

const TEST_STORE_SETTINGS = {
  store_name: "My Restaurant",
  // Mon/Tue/Wed/Sun → open 9am, close 2am
  monday_open: "09:00",    monday_close: "02:00",
  tuesday_open: "09:00",   tuesday_close: "02:00",
  wednesday_open: "09:00", wednesday_close: "02:00",
  sunday_open: "09:00",    sunday_close: "02:00",
  // Thu/Fri/Sat → open 9am, close 5am
  thursday_open: "09:00",  thursday_close: "05:00",
  friday_open: "09:00",    friday_close: "05:00",
  saturday_open: "09:00",  saturday_close: "05:00",
};

const TEST_EMPLOYEES = [
  {
    name: "Alex Rivera",
    title: "Shift Lead",
    available_hours: "Mon-Sat, open to close",
    min_hours: 35,
    max_hours: 45,
    notes: "Opening lead Mon/Wed/Fri. Reliable, always on time.",
    color: EMPLOYEE_COLORS[0],
    unavailable_hours: [],
  },
  {
    name: "Jordan Lee",
    title: "Server",
    available_hours: "Mon-Fri 10am-midnight",
    min_hours: 20,
    max_hours: 32,
    notes: "College student — prefers not to close on weeknights.",
    color: EMPLOYEE_COLORS[1],
    unavailable_hours: [
      { day: "Saturday", start_time: "00:00", end_time: "23:59" },
      { day: "Sunday",   start_time: "00:00", end_time: "23:59" },
    ],
  },
  {
    name: "Sam Patel",
    title: "Line Cook",
    available_hours: "Tue–Sun all day",
    min_hours: 28,
    max_hours: 40,
    notes: "Strong closer. Great on weekends.",
    color: EMPLOYEE_COLORS[2],
    unavailable_hours: [
      { day: "Monday", start_time: "00:00", end_time: "23:59" },
    ],
  },
  {
    name: "Casey Morgan",
    title: "Cashier",
    available_hours: "Thu–Sun 4pm–close",
    min_hours: 12,
    max_hours: 20,
    notes: "Part-time only. Not available before 4pm any day.",
    color: EMPLOYEE_COLORS[3],
    unavailable_hours: [
      { day: "Monday",    start_time: "00:00", end_time: "23:59" },
      { day: "Tuesday",   start_time: "00:00", end_time: "23:59" },
      { day: "Wednesday", start_time: "00:00", end_time: "23:59" },
      { day: "Thursday",  start_time: "00:00", end_time: "16:00" },
      { day: "Friday",    start_time: "00:00", end_time: "16:00" },
      { day: "Saturday",  start_time: "00:00", end_time: "16:00" },
      { day: "Sunday",    start_time: "00:00", end_time: "16:00" },
    ],
  },
  {
    name: "Taylor Kim",
    title: "Prep Cook",
    available_hours: "Mon-Fri 9am-3pm",
    min_hours: 25,
    max_hours: 30,
    notes: "Morning prep only. Must be done by 3pm for school pickup.",
    color: EMPLOYEE_COLORS[4],
    unavailable_hours: [
      { day: "Monday",    start_time: "15:00", end_time: "23:59" },
      { day: "Tuesday",   start_time: "15:00", end_time: "23:59" },
      { day: "Wednesday", start_time: "15:00", end_time: "23:59" },
      { day: "Thursday",  start_time: "15:00", end_time: "23:59" },
      { day: "Friday",    start_time: "15:00", end_time: "23:59" },
      { day: "Saturday",  start_time: "00:00", end_time: "23:59" },
      { day: "Sunday",    start_time: "00:00", end_time: "23:59" },
    ],
  },
  {
    name: "Marcus Webb",
    title: "Server",
    available_hours: "All week, open availability",
    min_hours: 30,
    max_hours: 40,
    notes: "Full availability. Happy to pick up extra shifts. Great closer.",
    color: EMPLOYEE_COLORS[5],
    unavailable_hours: [],
  },
  {
    name: "Priya Nair",
    title: "Bartender",
    available_hours: "Wed-Sun 5pm-close",
    min_hours: 20,
    max_hours: 30,
    notes: "Evenings only. Unavailable before 5pm. Best on Fri/Sat nights.",
    color: EMPLOYEE_COLORS[6],
    unavailable_hours: [
      { day: "Monday",    start_time: "00:00", end_time: "23:59" },
      { day: "Tuesday",   start_time: "00:00", end_time: "23:59" },
      { day: "Wednesday", start_time: "00:00", end_time: "17:00" },
      { day: "Thursday",  start_time: "00:00", end_time: "17:00" },
      { day: "Friday",    start_time: "00:00", end_time: "17:00" },
      { day: "Saturday",  start_time: "00:00", end_time: "17:00" },
      { day: "Sunday",    start_time: "00:00", end_time: "17:00" },
    ],
  },
];

const STORAGE_KEY = "dashboard_view_state";

function loadViewState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const { weekStartISO, selectedDayISO } = JSON.parse(raw);
    return {
      weekStart: weekStartISO ? new Date(weekStartISO) : null,
      selectedDay: selectedDayISO ? new Date(selectedDayISO) : null,
    };
  } catch { return null; }
}

function saveViewState(weekStart, selectedDay) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      weekStartISO: weekStart ? weekStart.toISOString() : null,
      selectedDayISO: selectedDay ? selectedDay.toISOString() : null,
    }));
  } catch {}
}

export default function Dashboard() {
  const savedState = loadViewState();
  const [weekStart, setWeekStart] = useState(savedState?.weekStart ?? startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [selectedDay, setSelectedDay] = useState(savedState?.selectedDay ?? null); // day view
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [editingShift, setEditingShift] = useState(null);
  const [preselectedEmployeeId, setPreselectedEmployeeId] = useState(null);
  const [defaultShiftStartTime, setDefaultShiftStartTime] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [copyWeekConfirmOpen, setCopyWeekConfirmOpen] = useState(false);
  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);
  const [timeOffDate, setTimeOffDate] = useState(null);
  const [timeOffEmployee, setTimeOffEmployee] = useState(null);
  const [editingTimeOff, setEditingTimeOff] = useState(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [employeeOrder, setEmployeeOrder] = useState(null); // null = not loaded yet
  const [orderSnapshot, setOrderSnapshot] = useState(null); // snapshot before reorder starts
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventDate, setEventDate] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const queryClient = useQueryClient();

  const { data: storeSettings = [] } = useQuery({
    queryKey: ["storeSettings"],
    queryFn: () => api.entities.StoreSettings.list(),
  });

  const settings = storeSettings[0] || null;

  const { data: rawEmployees = [], isLoading: loadingEmp } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.entities.Employee.list(),
  });

  // Persist view state on change
  useEffect(() => {
    saveViewState(weekStart, selectedDay);
  }, [weekStart, selectedDay]);

  // Load custom order from store settings
  useEffect(() => {
    if (storeSettings.length > 0) {
      const order = storeSettings[0]?.employee_order;
      if (order && Array.isArray(order)) {
        setEmployeeOrder(order);
      } else if (employeeOrder === null) {
        setEmployeeOrder([]);
      }
    } else if (storeSettings.length === 0 && !loadingShifts) {
      if (employeeOrder === null) setEmployeeOrder([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSettings]);

  // Sort employees: custom order first, then new ones appended at the end
  const employees = (() => {
    const base = [...rawEmployees].sort((a, b) => new Date(a.created_date).getTime() - new Date(b.created_date).getTime());
    if (!employeeOrder || employeeOrder.length === 0) return base;
    const orderMap = {};
    employeeOrder.forEach((id, i) => { orderMap[id] = i; });
    return base.sort((a, b) => {
      const ai = orderMap[a.id] ?? 9999;
      const bi = orderMap[b.id] ?? 9999;
      return ai - bi;
    });
  })();

  const { data: shifts = [], isLoading: loadingShifts } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => api.entities.Shift.list(),
  });

  const { data: timeOffs = [] } = useQuery({
    queryKey: ["timeOffs"],
    queryFn: () => api.entities.TimeOff.list(),
  });

  const { data: events = [] } = useQuery({
    queryKey: ["events"],
    queryFn: () => api.entities.Event.list(),
  });

  const createTimeOff = useMutation({
    mutationFn: (data) => api.entities.TimeOff.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timeOffs"] }),
  });

  const updateTimeOff = useMutation({
    mutationFn: ({ id, data }) => api.entities.TimeOff.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timeOffs"] }),
  });

  const deleteTimeOff = useMutation({
    mutationFn: (id) => api.entities.TimeOff.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["timeOffs"] }),
  });

  const createShift = useMutation({
    mutationFn: (data) => api.entities.Shift.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const updateShift = useMutation({
    mutationFn: ({ id, data }) => api.entities.Shift.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const deleteShift = useMutation({
    mutationFn: (id) => api.entities.Shift.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["shifts"] }),
  });

  const createEvent = useMutation({
    mutationFn: (data) => api.entities.Event.create(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });

  const updateEvent = useMutation({
    mutationFn: ({ id, data }) => api.entities.Event.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });

  const deleteEvent = useMutation({
    mutationFn: (id) => api.entities.Event.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["events"] }),
  });

  const handleAddShift = (day, preselectedEmployee, defaultStartTime = null) => {
    if (employees.length === 0) return;
    setEditingShift(null);
    setSelectedDate(day);
    setPreselectedEmployeeId(preselectedEmployee ? preselectedEmployee.id : null);
    setDefaultShiftStartTime(defaultStartTime);
    setModalOpen(true);
  };

  const handleEditShift = (shift) => {
    setEditingShift(shift);
    setSelectedDate(null);
    setModalOpen(true);
  };

  const handleAddTimeOff = (day, emp) => {
    setEditingTimeOff(null);
    setTimeOffDate(day);
    setTimeOffEmployee(emp || null);
    setTimeOffModalOpen(true);
  };

  const handleEditTimeOff = (timeOff) => {
    setEditingTimeOff(timeOff);
    setTimeOffDate(null);
    setTimeOffEmployee(null);
    setTimeOffModalOpen(true);
  };

  const handleAddEvent = (day) => {
    setEditingEvent(null);
    setEventDate(day);
    setEventModalOpen(true);
  };

  const handleEditEvent = (event) => {
    setEditingEvent(event);
    setEventDate(null);
    setEventModalOpen(true);
  };

  const handleSaveEvent = (data) => {
    if (editingEvent) {
      updateEvent.mutate({ id: editingEvent.id, data });
    } else {
      createEvent.mutate(data);
    }
    setEventModalOpen(false);
  };

  const handleSaveTimeOff = async (entries, editId) => {
    // entries is always an array of single-day payloads (no end_date)
    // Map UI 'date' field -> DB 'start_date' for each entry
    const payloads = entries.map(({ date, ...rest }) => ({ ...rest, start_date: date }));

    if (editId) {
      // Editing: only one row at a time — update in place
      updateTimeOff.mutate({ id: editId, data: payloads[0] });
    } else {
      // Creating: bulk-insert all days at once (works for 1 or many)
      await api.entities.TimeOff.bulkCreate(payloads);
      queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
    }
  };

  const handleSave = (data, editId) => {
    if (editId) {
      updateShift.mutate({ id: editId, data });
    } else {
      createShift.mutate(data);
    }
  };

  const handleLoadTestData = async () => {
    setIsLoadingData(true);

    // Clear existing data first
    for (const s of shifts) await api.entities.Shift.delete(s.id);
    for (const e of employees) await api.entities.Employee.delete(e.id);

    // Set store settings
    const existingSettings = await api.entities.StoreSettings.list();
    if (existingSettings.length > 0) {
      await api.entities.StoreSettings.update(existingSettings[0].id, TEST_STORE_SETTINGS);
    } else {
      await api.entities.StoreSettings.create(TEST_STORE_SETTINGS);
    }

    // Create employees
    const created = await api.entities.Employee.bulkCreate(TEST_EMPLOYEES);
    // Map by name for easy lookup
    const byName = {};
    created.forEach((e) => { byName[e.name] = e; });

    const alex   = byName["Alex Rivera"];
    const jordan = byName["Jordan Lee"];
    const sam    = byName["Sam Patel"];
    const casey  = byName["Casey Morgan"];
    const taylor = byName["Taylor Kim"];
    const marcus = byName["Marcus Webb"];
    const priya  = byName["Priya Nair"];

    const testShifts = [];
    const dayNames = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

    // Build shifts for Mon–Sun of the current week
    // weekStart = Monday
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart.getTime() + i * 86400000);
      return { date: format(d, "yyyy-MM-dd"), dayName: dayNames[d.getDay()] };
    });

    // Helper
    const shift = (emp, date, start, end) => ({
      employee_id: emp.id,
      employee_name: emp.name,
      date,
      start_time: start,
      end_time: end,
      color: emp.color,
    });

    // Monday (closes midnight / 00:00)
    // Alex + Taylor open, Jordan + Marcus mid, Sam closes, Casey off
    const mon = days[0].date;
    testShifts.push(shift(alex,   mon, "09:00", "17:00")); // opener
    testShifts.push(shift(taylor, mon, "09:00", "15:00")); // morning prep
    testShifts.push(shift(jordan, mon, "11:00", "20:00")); // mid
    testShifts.push(shift(marcus, mon, "16:00", "02:00")); // closer (stays past midnight — scheduled perfectly)

    // Tuesday
    const tue = days[1].date;
    testShifts.push(shift(alex,   tue, "09:00", "17:00"));
    testShifts.push(shift(taylor, tue, "09:00", "14:00")); // short day (under min — illustrates under-scheduled)
    testShifts.push(shift(sam,    tue, "12:00", "22:00"));
    testShifts.push(shift(marcus, tue, "17:00", "02:00")); // closer

    // Wednesday
    const wed = days[2].date;
    testShifts.push(shift(alex,   wed, "09:00", "17:00")); // opener
    testShifts.push(shift(taylor, wed, "09:00", "15:00")); // morning prep
    testShifts.push(shift(jordan, wed, "12:00", "22:00")); // mid
    testShifts.push(shift(sam,    wed, "14:00", "02:00")); // closer
    testShifts.push(shift(priya,  wed, "17:00", "02:00")); // evening bartender

    // Thursday (closes 3am — busier night)
    const thu = days[3].date;
    testShifts.push(shift(alex,   thu, "09:00", "17:00")); // opener
    testShifts.push(shift(taylor, thu, "09:00", "15:00")); // morning prep
    testShifts.push(shift(jordan, thu, "11:00", "21:00")); // mid
    testShifts.push(shift(sam,    thu, "15:00", "03:00")); // closer (goes to 3am — staying for full close)
    testShifts.push(shift(casey,  thu, "16:00", "03:00")); // evening cashier
    testShifts.push(shift(priya,  thu, "17:00", "03:00")); // bartender full night
    testShifts.push(shift(marcus, thu, "18:00", "03:00")); // extra server — slightly over max hours for illustration

    // Friday (closes 3am — busiest)
    const fri = days[4].date;
    testShifts.push(shift(alex,   fri, "09:00", "19:00")); // long opener shift
    testShifts.push(shift(taylor, fri, "09:00", "14:00")); // prep only
    testShifts.push(shift(sam,    fri, "12:00", "03:00")); // all-day closer
    testShifts.push(shift(casey,  fri, "16:00", "03:00")); // evening
    testShifts.push(shift(priya,  fri, "17:00", "03:00")); // full night
    testShifts.push(shift(marcus, fri, "15:00", "03:00")); // full close

    // Saturday (closes 3am)
    const sat = days[5].date;
    testShifts.push(shift(alex,   sat, "09:00", "18:00")); // opener
    testShifts.push(shift(sam,    sat, "10:00", "22:00")); // mid–close
    testShifts.push(shift(casey,  sat, "16:00", "03:00")); // evening
    testShifts.push(shift(priya,  sat, "17:00", "03:00")); // full night bartender
    testShifts.push(shift(marcus, sat, "12:00", "03:00")); // full closer — over max hrs illustrating over-schedule

    // Sunday (closes midnight)
    const sun = days[6].date;
    testShifts.push(shift(alex,   sun, "09:00", "16:00")); // lighter sunday opener
    testShifts.push(shift(sam,    sun, "11:00", "22:00")); // mid
    testShifts.push(shift(marcus, sun, "14:00", "02:00")); // closer

    await api.entities.Shift.bulkCreate(testShifts);
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
    setIsLoadingData(false);
  };

  const handleClearWeek = async () => {
    const weekEndDate = addWeeks(weekStart, 1);
    const weekShifts = shifts.filter((s) => {
      const d = new Date(s.date + "T00:00:00");
      return d >= weekStart && d < weekEndDate;
    });
    for (const s of weekShifts) await api.entities.Shift.delete(s.id);
    // Also delete regular_off time offs for the week (keep custom_time_off)
    const weekTimeOffs = timeOffs.filter((t) => {
      if (t.type !== "regular_off") return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= weekStart && d < weekEndDate;
    });
    for (const t of weekTimeOffs) await api.entities.TimeOff.delete(t.id);
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
  };

  const handleClearDay = async () => {
    if (!selectedDay) return;
    const dayStr = format(selectedDay, "yyyy-MM-dd");
    const dayShifts = shifts.filter((s) => s.date === dayStr);
    for (const s of dayShifts) await api.entities.Shift.delete(s.id);
    // Also delete regular_off time offs for the day (keep custom_time_off)
    const dayTimeOffs = timeOffs.filter((t) => t.date === dayStr && t.type === "regular_off");
    for (const t of dayTimeOffs) await api.entities.TimeOff.delete(t.id);
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
  };

  const handleResetAll = async () => {
    setIsLoadingData(true);
    for (const s of shifts) await api.entities.Shift.delete(s.id);
    for (const e of employees) await api.entities.Employee.delete(e.id);
    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    setIsLoadingData(false);
  };

  const handleCopyPreviousWeek = async () => {
    const prevWeekStart = subWeeks(weekStart, 1);
    const prevWeekEnd = addWeeks(prevWeekStart, 1);
    const currWeekEnd = addWeeks(weekStart, 1);

    // Delete all shifts in current week
    const currShifts = shifts.filter((s) => {
      const d = new Date(s.date + "T00:00:00");
      return d >= weekStart && d < currWeekEnd;
    });
    for (const s of currShifts) await api.entities.Shift.delete(s.id);

    // Delete regular_off time offs in current week (keep custom_time_off / red ones)
    const currTimeOffs = timeOffs.filter((t) => {
      if (t.type !== "regular_off") return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= weekStart && d < currWeekEnd;
    });
    for (const t of currTimeOffs) await api.entities.TimeOff.delete(t.id);

    // Copy shifts from previous week, offsetting dates by +7 days
    const prevShifts = shifts.filter((s) => {
      const d = new Date(s.date + "T00:00:00");
      return d >= prevWeekStart && d < prevWeekEnd;
    });
    if (prevShifts.length > 0) {
      await api.entities.Shift.bulkCreate(
        prevShifts.map(({ employee_id, employee_name, start_time, end_time, color, date }) => {
          const newDate = new Date(date + "T00:00:00");
          newDate.setDate(newDate.getDate() + 7);
          return { employee_id, employee_name, start_time, end_time, color, date: format(newDate, "yyyy-MM-dd") };
        })
      );
    }

    // Copy regular_off time offs from previous week
    const prevTimeOffs = timeOffs.filter((t) => {
      if (t.type !== "regular_off") return false;
      const d = new Date(t.date + "T00:00:00");
      return d >= prevWeekStart && d < prevWeekEnd;
    });
    if (prevTimeOffs.length > 0) {
      await api.entities.TimeOff.bulkCreate(
        prevTimeOffs.map(({ employee_id, employee_name, type, full_day, start_time, end_time, reason, date }) => {
          const newDate = new Date(date + "T00:00:00");
          newDate.setDate(newDate.getDate() + 7);
          return { employee_id, employee_name, type, full_day, start_time, end_time, reason, date: format(newDate, "yyyy-MM-dd") };
        })
      );
    }

    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["timeOffs"] });
  };

  const handleCopyPreviousDay = async () => {
    if (!selectedDay) return;
    const prevDay = subDays(selectedDay, 1);
    const prevDateStr = format(prevDay, "yyyy-MM-dd");
    const todayDateStr = format(selectedDay, "yyyy-MM-dd");

    // Delete all shifts for today
    const todayShifts = shifts.filter((s) => s.date === todayDateStr);
    for (const s of todayShifts) await api.entities.Shift.delete(s.id);

    // Copy previous day's shifts to today
    const prevShifts = shifts.filter((s) => s.date === prevDateStr);
    if (prevShifts.length > 0) {
      await api.entities.Shift.bulkCreate(
        prevShifts.map(({ employee_id, employee_name, start_time, end_time, color }) => ({
          employee_id, employee_name, start_time, end_time, color, date: todayDateStr,
        }))
      );
    }

    queryClient.invalidateQueries({ queryKey: ["shifts"] });
  };

  const handleReorder = useCallback((newOrderIds) => {
    setEmployeeOrder(newOrderIds);
  }, []);

  const handleSaveOrder = useCallback(async () => {
    const existing = await api.entities.StoreSettings.list();
    if (existing.length > 0) {
      await api.entities.StoreSettings.update(existing[0].id, { employee_order: employeeOrder });
    } else {
      await api.entities.StoreSettings.create({ employee_order: employeeOrder });
    }
    queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
    setOrderSnapshot(null);
    setIsReorderMode(false);
  }, [employeeOrder, queryClient]);

  const handleCancelReorder = useCallback(() => {
    // Restore the snapshot taken when reorder mode was entered
    if (orderSnapshot !== null) setEmployeeOrder(orderSnapshot);
    setOrderSnapshot(null);
    setIsReorderMode(false);
  }, [orderSnapshot]);

  // ESC key to cancel reorder mode
  useEffect(() => {
    if (!isReorderMode) return;
    const handler = (e) => { if (e.key === "Escape") handleCancelReorder(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isReorderMode, handleCancelReorder]);

  const isLoading = loadingEmp || loadingShifts;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-400 mt-1">
            {employees.length} employee{employees.length !== 1 ? "s" : ""} - {shifts.length} shift{shifts.length !== 1 ? "s" : ""} scheduled
          </p>
        </div>
        <DataControls onLoadTestData={handleLoadTestData} onResetAll={handleResetAll} isLoading={isLoadingData} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <div className="flex-1">
          <WeekNav
            currentWeekStart={weekStart}
            onPrev={() => {
              setWeekStart(subWeeks(weekStart, 1));
              if (selectedDay) setSelectedDay(new Date(selectedDay.getTime() - 7 * 86400000));
            }}
            onNext={() => {
              setWeekStart(addWeeks(weekStart, 1));
              if (selectedDay) setSelectedDay(new Date(selectedDay.getTime() + 7 * 86400000));
            }}
            onToday={() => {
              const today = new Date();
              setWeekStart(startOfWeek(today, { weekStartsOn: 1 }));
              if (selectedDay) setSelectedDay(today);
            }}
            isDayView={!!selectedDay}
            selectedDay={selectedDay}
            onCopyPreviousWeek={() => setCopyWeekConfirmOpen(true)}
            onClearWeek={handleClearWeek}
            shifts={shifts}
            employees={employees}
            onNavigateToWeek={setWeekStart}
            onNavigateToDay={setSelectedDay}
          />
        </div>
        {isReorderMode ? (
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-gray-400 hidden sm:block">Drag rows · Esc to cancel</span>
            <button
              onClick={handleSaveOrder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-sm font-medium transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Save Order
            </button>
            <button
              onClick={handleCancelReorder}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 text-sm font-medium transition-colors"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => { setOrderSnapshot(employeeOrder); setIsReorderMode(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 text-sm font-medium transition-colors shrink-0"
            title="Reorder employees"
          >
            <GripVertical className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reorder</span>
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : selectedDay ? (
       <DayView
          day={selectedDay}
          shifts={shifts}
          timeOffs={timeOffs}
          events={events}
          employees={employees}
          storeSettings={settings}
          onAddShift={handleAddShift}
          onEditShift={handleEditShift}
          onAddTimeOff={handleAddTimeOff}
          onEditTimeOff={handleEditTimeOff}
          onAddEvent={handleAddEvent}
          onEditEvent={handleEditEvent}
          onShiftDragSave={(id, start, end, targetEmpId) => {
            const targetEmp = employees.find((e) => e.id === targetEmpId);
            const origShift = shifts.find((s) => s.id === id);
            const updateData = { start_time: start, end_time: end };
            if (targetEmp && targetEmpId !== origShift?.employee_id) {
              updateData.employee_id = targetEmpId;
              updateData.employee_name = targetEmp.name;
              updateData.color = targetEmp.color;
            }
            updateShift.mutate({ id, data: updateData });
          }}
          onShiftCopy={(origShift, targetEmp, newStart, newEnd) => {
            createShift.mutate({
              employee_id: targetEmp.id,
              employee_name: targetEmp.name,
              date: origShift.date,
              start_time: newStart,
              end_time: newEnd,
              color: targetEmp.color,
            });
          }}
          onPrevDay={() => setSelectedDay(new Date(selectedDay.getTime() - 86400000))}
          onNextDay={() => setSelectedDay(new Date(selectedDay.getTime() + 86400000))}
          onClose={() => setSelectedDay(null)}
          isReorderMode={isReorderMode}
          onReorder={handleReorder}
          onCopyPreviousDay={() => setCopyConfirmOpen(true)}
          onClearDay={handleClearDay}
        />
      ) : (
       <CalendarGrid
       weekStart={weekStart}
       shifts={shifts}
       timeOffs={timeOffs}
       events={events}
       employees={employees}
       onAddShift={handleAddShift}
       onEditShift={handleEditShift}
       onEditTimeOff={handleEditTimeOff}
       onAddTimeOff={handleAddTimeOff}
       onSelectDay={(day) => setSelectedDay(day)}
       onAddEvent={handleAddEvent}
       onEditEvent={handleEditEvent}
       isReorderMode={isReorderMode}
       onReorder={handleReorder}
       />
      )}

      <AlertDialog open={copyConfirmOpen} onOpenChange={setCopyConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy previous day's shifts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will delete all shifts currently scheduled for{" "}
              {selectedDay ? format(selectedDay, "EEEE, MMMM d") : "this day"} and replace them with the shifts from{" "}
              {selectedDay ? format(subDays(selectedDay, 1), "EEEE, MMMM d") : "the previous day"}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCopyPreviousDay}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Yes, copy shifts
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={copyWeekConfirmOpen} onOpenChange={setCopyWeekConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Copy previous week's schedule?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace all shifts and blue (regular) time offs for the week of{" "}
              {format(weekStart, "MMM d")} - {format(addWeeks(weekStart, 1), "MMM d")} with the schedule from the previous week.
              Red (custom) time off requests will be kept. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleCopyPreviousWeek}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Yes, copy week
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <TimeOffModal
        open={timeOffModalOpen}
        onClose={() => { setTimeOffModalOpen(false); setEditingTimeOff(null); }}
        date={timeOffDate}
        employee={timeOffEmployee}
        employees={employees}
        onSave={handleSaveTimeOff}
        onDelete={(id) => deleteTimeOff.mutate(id)}
        editTimeOff={editingTimeOff}
        storeSettings={settings}
      />

      <AddShiftModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setEditingShift(null); setPreselectedEmployeeId(null); setDefaultShiftStartTime(null); }}
        date={selectedDate}
        employees={employees}
        shifts={shifts}
        storeSettings={settings}
        onSave={handleSave}
        editShift={editingShift}
        onDelete={(id) => deleteShift.mutate(id)}
        preselectedEmployeeId={preselectedEmployeeId}
        defaultStartTime={defaultShiftStartTime}
      />

      <AddEditEventModal
        isOpen={eventModalOpen}
        onClose={() => { setEventModalOpen(false); setEditingEvent(null); setEventDate(null); }}
        initialDate={eventDate}
        event={editingEvent}
        onSave={handleSaveEvent}
        onDelete={(id) => deleteEvent.mutate(id)}
      />
    </div>
  );
}