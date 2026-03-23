import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Database, Trash2, Loader2 } from "lucide-react";

export default function DataControls({ onLoadTestData, onResetAll, isLoading }) {
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);

  return (
    <div id="data-controls" className="flex items-center gap-2 mt-8">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowLoadConfirm(true)}
        disabled={isLoading}
        className="text-xs gap-1.5"
      >
        {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Database className="w-3 h-3" />}
        Load Test Data
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowResetConfirm(true)}
        disabled={isLoading}
        className="text-xs gap-1.5 text-red-500 hover:text-red-600 hover:bg-red-50 border-red-200"
      >
        <Trash2 className="w-3 h-3" />
        Reset All
      </Button>

      <AlertDialog open={showLoadConfirm} onOpenChange={setShowLoadConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Load Test Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite existing data with sample employees and shifts. This action cannot be undone. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onLoadTestData();
                setShowLoadConfirm(false);
              }}
              className="bg-orange-500 hover:bg-orange-600"
            >
              Yes, Load Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showResetConfirm} onOpenChange={setShowResetConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset All Data?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete all employees and shifts. This action cannot be undone. Are you sure?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onResetAll();
                setShowResetConfirm(false);
              }}
              className="bg-red-500 hover:bg-red-600"
            >
              Yes, Reset Everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}