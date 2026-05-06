import { startOfWeek, format } from "date-fns";
import { api } from "@/api/api";

const EMPLOYEE_COLORS = [
  "#FF8C00", "#3B82F6", "#10B981", "#8B5CF6",
  "#EC4899", "#F59E0B", "#06B6D4", "#EF4444",
  "#6366F1", "#14B8A6", "#F97316", "#84CC16",
];

export const TEST_STORE_SETTINGS = {
  store_name: "My Restaurant",
  monday_open: "09:00",    monday_close: "02:00",
  tuesday_open: "09:00",   tuesday_close: "02:00",
  wednesday_open: "09:00", wednesday_close: "02:00",
  sunday_open: "09:00",    sunday_close: "02:00",
  thursday_open: "09:00",  thursday_close: "05:00",
  friday_open: "09:00",    friday_close: "05:00",
  saturday_open: "09:00",  saturday_close: "05:00",
};

export const TEST_EMPLOYEES = [
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
    notes: "College student - prefers not to close on weeknights.",
    color: EMPLOYEE_COLORS[1],
    unavailable_hours: [
      { day: "Saturday", start_time: "00:00", end_time: "23:59" },
      { day: "Sunday",   start_time: "00:00", end_time: "23:59" },
    ],
  },
  {
    name: "Sam Patel",
    title: "Line Cook",
    available_hours: "Tue-Sun all day",
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
    available_hours: "Thu-Sun 4pm-close",
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

export const loadTestData = async (queryClient) => {
  // Clear existing data first
  const existingShifts = await api.entities.Shift.list();
  for (const s of existingShifts) await api.entities.Shift.delete(s.id);
  
  const existingEmployees = await api.entities.Employee.list();
  for (const e of existingEmployees) await api.entities.Employee.delete(e.id);

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

  // Build shifts for Mon-Sun of the current week
  // weekStart = Monday
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
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

  const mon = days[0].date;
  testShifts.push(shift(alex,   mon, "09:00", "17:00")); // opener
  testShifts.push(shift(taylor, mon, "09:00", "15:00")); // morning prep
  testShifts.push(shift(jordan, mon, "11:00", "20:00")); // mid
  testShifts.push(shift(marcus, mon, "16:00", "02:00")); // closer

  const tue = days[1].date;
  testShifts.push(shift(alex,   tue, "09:00", "17:00"));
  testShifts.push(shift(taylor, tue, "09:00", "14:00")); 
  testShifts.push(shift(sam,    tue, "12:00", "22:00"));
  testShifts.push(shift(marcus, tue, "17:00", "02:00")); 

  const wed = days[2].date;
  testShifts.push(shift(alex,   wed, "09:00", "17:00")); 
  testShifts.push(shift(taylor, wed, "09:00", "15:00")); 
  testShifts.push(shift(jordan, wed, "12:00", "22:00")); 
  testShifts.push(shift(sam,    wed, "14:00", "02:00")); 
  testShifts.push(shift(priya,  wed, "17:00", "02:00")); 

  const thu = days[3].date;
  testShifts.push(shift(alex,   thu, "09:00", "17:00")); 
  testShifts.push(shift(taylor, thu, "09:00", "15:00")); 
  testShifts.push(shift(jordan, thu, "11:00", "21:00")); 
  testShifts.push(shift(sam,    thu, "15:00", "03:00")); 
  testShifts.push(shift(casey,  thu, "16:00", "03:00")); 
  testShifts.push(shift(priya,  thu, "17:00", "03:00")); 
  testShifts.push(shift(marcus, thu, "18:00", "03:00")); 

  const fri = days[4].date;
  testShifts.push(shift(alex,   fri, "09:00", "19:00")); 
  testShifts.push(shift(taylor, fri, "09:00", "14:00")); 
  testShifts.push(shift(sam,    fri, "12:00", "03:00")); 
  testShifts.push(shift(casey,  fri, "16:00", "03:00")); 
  testShifts.push(shift(priya,  fri, "17:00", "03:00")); 
  testShifts.push(shift(marcus, fri, "15:00", "03:00")); 

  const sat = days[5].date;
  testShifts.push(shift(alex,   sat, "09:00", "18:00")); 
  testShifts.push(shift(sam,    sat, "10:00", "22:00")); 
  testShifts.push(shift(casey,  sat, "16:00", "03:00")); 
  testShifts.push(shift(priya,  sat, "17:00", "03:00")); 
  testShifts.push(shift(marcus, sat, "12:00", "03:00")); 

  const sun = days[6].date;
  testShifts.push(shift(alex,   sun, "09:00", "16:00")); 
  testShifts.push(shift(sam,    sun, "11:00", "22:00")); 
  testShifts.push(shift(marcus, sun, "14:00", "02:00")); 

  await api.entities.Shift.bulkCreate(testShifts);
  queryClient.invalidateQueries({ queryKey: ["employees"] });
  queryClient.invalidateQueries({ queryKey: ["shifts"] });
  queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
};

export const resetAllData = async (queryClient) => {
  const existingShifts = await api.entities.Shift.list();
  for (const s of existingShifts) await api.entities.Shift.delete(s.id);

  const existingEmployees = await api.entities.Employee.list();
  for (const e of existingEmployees) await api.entities.Employee.delete(e.id);
  
  queryClient.invalidateQueries({ queryKey: ["employees"] });
  queryClient.invalidateQueries({ queryKey: ["shifts"] });
};
