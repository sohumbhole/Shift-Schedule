import React, { useState, useEffect } from "react";
import { api } from "@/api/api";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Loader2, Clock, Store, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import ApiAccessCard from "@/components/settings/ApiAccessCard";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const DAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: settingsList = [], isLoading } = useQuery({
    queryKey: ["storeSettings"],
    queryFn: () => api.entities.StoreSettings.list(),
  });

  const settings = settingsList[0] || null;

  const [form, setForm] = useState({
    store_name: "Atomic Wings Champaign",
    manager_name: "",
    notes: "",
  });
  const [hours, setHours] = useState({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        store_name: settings.store_name || "Atomic Wings Champaign",
        manager_name: settings.manager_name || "",
        notes: settings.notes || "",
      });
      const h = {};
      DAYS.forEach((d) => {
        h[d + "_open"] = settings[d + "_open"] || "10:00";
        h[d + "_close"] = settings[d + "_close"] || "22:00";
      });
      setHours(h);
    } else {
      const h = {};
      DAYS.forEach((d) => {
        h[d + "_open"] = "10:00";
        h[d + "_close"] = "22:00";
      });
      setHours(h);
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (settings) {
        return api.entities.StoreSettings.update(settings.id, data);
      } else {
        return api.entities.StoreSettings.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["storeSettings"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const handleSave = () => {
    saveMutation.mutate({ ...form, ...hours });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Settings
          </h1>
          <p className="text-sm text-gray-400 mt-1">Store hours &amp; information</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={createPageUrl("Dashboard")}>
            <Button variant="outline" className="gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              Dashboard
            </Button>
          </Link>
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className={"gap-1.5 transition-colors " + (saved ? "bg-green-500 hover:bg-green-600" : "bg-orange-500 hover:bg-orange-600")}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {saved ? "Saved!" : "Save Settings"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-gray-100">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Store className="w-4 h-4 text-orange-500" />
              Store Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Store Name</Label>
              <Input
                value={form.store_name}
                onChange={(e) => setForm({ ...form, store_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Manager Name</Label>
              <Input
                value={form.manager_name}
                onChange={(e) => setForm({ ...form, manager_name: e.target.value })}
                placeholder="Enter manager name"
              />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Any additional store notes..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        <Card id="store-hours-settings" className="border-gray-100">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-orange-500" />
              Operating Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {DAYS.map((day, i) => (
                <div key={day} className="flex items-center gap-3">
                  <span className="w-24 text-sm font-medium text-gray-600">
                    {DAY_LABELS[i]}
                  </span>
                  <Input
                    type="time"
                    value={hours[day + "_open"] || "10:00"}
                    onChange={(e) => setHours({ ...hours, [day + "_open"]: e.target.value })}
                    className="w-28 text-sm"
                  />
                  <span className="text-gray-300 text-sm">to</span>
                  <Input
                    type="time"
                    value={hours[day + "_close"] || "22:00"}
                    onChange={(e) => setHours({ ...hours, [day + "_close"]: e.target.value })}
                    className="w-28 text-sm"
                  />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div id="api-access" className="mt-6">
        <ApiAccessCard />
      </div>
    </div>
  );
}