import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal, Copy, PauseCircle, PlayCircle, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SuspendDialog } from "./lifecycle/SuspendDialog";
import { ResumeDialog } from "./lifecycle/ResumeDialog";
import { DestroyDialog } from "./lifecycle/DestroyDialog";
import { CloneInstanceDialog } from "./lifecycle/CloneInstanceDialog";
import type { Instance } from "@/types/instance";

interface InstanceRowActionsProps {
  instance: Instance;
}

export function InstanceRowActions({ instance }: InstanceRowActionsProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [cloneOpen, setCloneOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [resumeOpen, setResumeOpen] = useState(false);
  const [destroyOpen, setDestroyOpen] = useState(false);

  const canSuspend = instance.status === "RUNNING";
  const canResume = ["SUSPENDED", "STOPPED", "ERROR"].includes(instance.status);
  const canDestroy = ["RUNNING", "SUSPENDED", "STOPPED", "ERROR"].includes(instance.status);

  function handleCloneSuccess(clonedId: string) {
    void navigate({ to: "/instances/$id", params: { id: clonedId } });
  }

  function handleLifecycleSuccess() {
    void queryClient.invalidateQueries({ queryKey: ["instances"] });
  }

  function handleDestroySuccess() {
    void queryClient.invalidateQueries({ queryKey: ["instances"] });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-4 w-4" />
            <span className="sr-only">Actions for {instance.name}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setCloneOpen(true)}>
            <Copy className="h-4 w-4" />
            Clone
          </DropdownMenuItem>

          {canSuspend && (
            <DropdownMenuItem
              onClick={() => setSuspendOpen(true)}
              className="text-amber-600 focus:text-amber-600"
            >
              <PauseCircle className="h-4 w-4" />
              Suspend
            </DropdownMenuItem>
          )}

          {canResume && (
            <DropdownMenuItem
              onClick={() => setResumeOpen(true)}
              className="text-green-600 focus:text-green-600"
            >
              <PlayCircle className="h-4 w-4" />
              Resume
            </DropdownMenuItem>
          )}

          {canDestroy && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDestroyOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Destroy
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <CloneInstanceDialog
        instance={instance}
        open={cloneOpen}
        onClose={() => setCloneOpen(false)}
        onSuccess={handleCloneSuccess}
      />

      <SuspendDialog
        instance={instance}
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        onSuccess={handleLifecycleSuccess}
      />

      <ResumeDialog
        instance={instance}
        open={resumeOpen}
        onOpenChange={setResumeOpen}
        onSuccess={handleLifecycleSuccess}
      />

      <DestroyDialog
        instance={instance}
        open={destroyOpen}
        onOpenChange={setDestroyOpen}
        onSuccess={handleDestroySuccess}
      />
    </>
  );
}
