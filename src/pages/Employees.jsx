import React, { useState, useEffect, useRef } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useUndoHistory } from "@/lib/undoHistory";
import { Button } from "@/components/ui/button";
import { Plus, Loader2, Users, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import EmployeeCard from "../components/employees/EmployeeCard";
import EmployeeModal from "../components/employees/EmployeeModal";
import TimeOffModal from "../components/dashboard/TimeOffModal";

export default function Employees() {
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [timeOffModalOpen, setTimeOffModalOpen] = useState(false);
  const [timeOffEmployee, setTimeOffEmployee] = useState(null);
  const [editingTimeOff, setEditingTimeOff] = useState(null);
  const queryClient = useQueryClient();
  const history = useUndoHistory();

  const urlParams = new URLSearchParams(window.location.search);
  const editEmpId = urlParams.get("edit");

  const { data: rawEmployees = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: () => api.entities.Employee.list(),
  });
  const employees = [...rawEmployees].sort((a, b) => new Date(a.created_date) - new Date(b.created_date));

  // Auto-open modal when navigated here with ?edit=empId
  const autoOpenedRef = React.useRef(false);
  React.useEffect(() => {
    if (!editEmpId || autoOpenedRef.current || employees.length === 0) return;
    const emp = employees.find((e) => e.id === editEmpId);
    if (emp) {
      autoOpenedRef.current = true;
      setSelectedEmployee(emp);
      setModalOpen(true);
    }
  }, [editEmpId, employees]);

  const createEmployee = useMutation({
    mutationFn: (data) => api.entities.Employee.create(data),
    onSuccess: (created, variables) => {
      queryClient.invalidateQueries({ queryKey: ["employees"] });
      history.push({
        type: "ADD_EMPLOYEE",
        description: `Added employee: ${created.name}`,
        page: "employees",
        weekStart: null,
        dayDate: null,
        backward: { id: created.id },
        forward: variables,
      });
    },
  });

  const updateEmployee = useMutation({
    mutationFn: ({ id, data }) => api.entities.Employee.update(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["employees"] }),
  });

  // Cascade delete: removes all of the employee's shifts and time offs first,
  // then the employee. Stores everything for undo.
  const handleDeleteEmployee = async (id) => {
    const emp = rawEmployees.find((e) => e.id === id);
    // Fetch from cache if available, otherwise fetch from server
    let allShifts = queryClient.getQueryData(["shifts"]);
    if (!allShifts) allShifts = await api.entities.Shift.list();
    let allTimeOffs = queryClient.getQueryData(["timeOffs"]);
    if (!allTimeOffs) allTimeOffs = await api.entities.TimeOff.list();

    const empShifts = allShifts.filter((s) => s.employee_id === id);
    const empTimeOffs = allTimeOffs.filter((t) => t.employee_id === id);

    // Save payloads (no id/user_id/created_date) for undo recreation
    const savedShifts = empShifts.map(({ employee_id, employee_name, date, start_time, end_time, color }) =>
      ({ employee_id, employee_name, date, start_time, end_time, color }));
    const savedTimeOffs = empTimeOffs.map(({ employee_id, employee_name, type, full_day, start_time, end_time, reason, date, start_date }) =>
      ({ employee_id, employee_name, type, full_day, start_time, end_time, reason, date: date || start_date }));
    const { id: _id, user_id: _u, created_date: _c, ...empPayload } = emp || {};

    for (const s of empShifts) await api.entities.Shift.delete(s.id);
    for (const t of empTimeOffs) await api.entities.TimeOff.delete(t.id);
    await api.entities.Employee.delete(id);

    queryClient.invalidateQueries({ queryKey: ["employees"] });
    queryClient.invalidateQueries({ queryKey: ["shifts"] });
    queryClient.invalidateQueries({ queryKey: ["timeOffs"] });

    history.push({
      type: "DELETE_EMPLOYEE",
      description: `Deleted employee: ${emp?.name || "employee"}`,
      page: "employees",
      weekStart: null,
      dayDate: null,
      backward: { employee: empPayload, shifts: savedShifts, timeOffs: savedTimeOffs },
      forward: { id },
    });
  };

  const handleSave = (data) => {
    if (selectedEmployee) {
      updateEmployee.mutate({ id: selectedEmployee.id, data });
    } else {
      createEmployee.mutate(data);
    }
  };

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

  const handleSaveTimeOff = (data, editId) => {
    if (editId) {
      updateTimeOff.mutate({ id: editId, data });
    } else {
      createTimeOff.mutate(data);
    }
  };

  const handleCardClick = (emp) => {
    setSelectedEmployee(emp);
    setModalOpen(true);
  };

  const handleAddTimeOffForEmp = (emp) => {
    setTimeOffEmployee(emp);
    setEditingTimeOff(null);
    setTimeOffModalOpen(true);
  };

  const handleAdd = () => {
    setSelectedEmployee(null);
    setModalOpen(true);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Employees
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            {employees.length} team member{employees.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={createPageUrl("Dashboard")}>
            <Button variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
          </Link>
          <Button onClick={handleAdd} className="bg-orange-500 hover:bg-orange-600 gap-1.5">
            <Plus className="w-4 h-4" />
            Add Employee
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-32">
          <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <Users className="w-8 h-8 text-gray-300" />
          </div>
          <p className="text-gray-400 text-sm">No employees yet</p>
          <p className="text-gray-300 text-xs mt-1">
            Add your first employee or load test data from the dashboard
          </p>
        </div>
      ) : (
        <div id="employee-list" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {employees.map((emp) => (
            <EmployeeCard key={emp.id} employee={emp} onClick={handleCardClick} onAddTimeOff={handleAddTimeOffForEmp} />
          ))}
        </div>
      )}

      <EmployeeModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedEmployee(null);
        }}
        employee={selectedEmployee}
        onSave={handleSave}
        onDelete={handleDeleteEmployee}
      />

      <TimeOffModal
        open={timeOffModalOpen}
        onClose={() => { setTimeOffModalOpen(false); setTimeOffEmployee(null); setEditingTimeOff(null); }}
        employee={timeOffEmployee}
        employees={employees}
        onSave={handleSaveTimeOff}
        onDelete={(id) => deleteTimeOff.mutate(id)}
        editTimeOff={editingTimeOff}
      />
    </div>
  );
}