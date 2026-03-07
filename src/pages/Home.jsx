import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Flame, ArrowRight, Calendar, Users, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Hero */}
      <section id="landing-hero" className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="max-w-2xl text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-200 mb-8">
            <Flame className="w-10 h-10 text-white" />
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-gray-900 tracking-tight leading-tight">
            Restaurant
            <span className="block text-orange-500">Scheduler</span>
          </h1>

          <p className="mt-6 text-lg sm:text-xl text-gray-500 leading-relaxed max-w-lg mx-auto">
            Streamlined shift management and employee coordination for your team.
          </p>

          <Link to={createPageUrl("Dashboard")}>
            <Button
              size="lg"
              className="mt-10 bg-orange-500 hover:bg-orange-600 text-white px-8 py-6 text-lg rounded-xl shadow-lg shadow-orange-200 hover:shadow-xl hover:shadow-orange-200 transition-all duration-300"
            >
              Go to Dashboard
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>

          {/* Feature pills */}
          <div className="mt-16 flex flex-wrap items-center justify-center gap-4">
            {[
              { icon: Calendar, label: "Shift Calendar" },
              { icon: Users, label: "Employee Profiles" },
              { icon: Clock, label: "Hours Tracking" },
            ].map((feature) => (
              <div
                key={feature.label}
                className="flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-gray-50 border border-gray-100"
              >
                <feature.icon className="w-4 h-4 text-orange-500" />
                <span className="text-sm font-medium text-gray-600">
                  {feature.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}