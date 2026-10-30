"use client";

import type { Cluster } from "@/lib/services/cluster.service";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ClusterDeleteDialogProps {
  isOpen: boolean;
  cluster: Cluster | null;
  onConfirm: () => void;
  onClose: (open: boolean) => void;
}

export function ClusterDeleteDialog({
  isOpen,
  cluster,
  onConfirm,
  onClose,
}: ClusterDeleteDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete Cluster</DialogTitle>
          <DialogDescription>
            Are you sure you want to delete the &quot;{cluster?.name}&quot; cluster?
            <br />
            This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>
            Cancel
          </Button>
          <Button onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
