"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { logger } from "@/lib/utils/logger";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Users, Plus, Pencil, Trash2, Search, CheckCircle } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { type ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { usePlatformUsers } from "./hooks/usePlatformUsers";
import { useCHUserMapping } from "./hooks/useCHUserMapping";
import { AddUserDialog } from "./dialogs/AddUserDialog";
import { EditUserDialog } from "./dialogs/EditUserDialog";
import { DeleteUserDialog } from "./dialogs/DeleteUserDialog";
import type {
  PlatformUser,
  UserFormState,
  ConnectionTestStatus,
  ClusterAccessResponse,
} from "./types";
import { defaultAppUserFormValues, type CreateAppUserInput, type UpdateAppUserInput } from "@/lib/validation";

export function SecurityManagement() {
  const { platformUsers, setPlatformUsers, reloadUsers } = usePlatformUsers();
  const { clusters, chUsers, isLoadingChUsers } = useCHUserMapping();
  const connectionTestTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddUserDialogOpen, setIsAddUserDialogOpen] = useState(false);
  const [isEditUserDialogOpen, setIsEditUserDialogOpen] = useState(false);
  const [isDeleteUserDialogOpen, setIsDeleteUserDialogOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<PlatformUser | null>(null);
  const [userFormInitialValues, setUserFormInitialValues] = useState<UserFormState>(defaultAppUserFormValues);
  const [connectionTestStatus, setConnectionTestStatus] = useState<ConnectionTestStatus>({});

  useEffect(() => {
    const timers = connectionTestTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const filteredUsers = platformUsers.filter(user =>
    searchQuery === "" ||
    user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.role.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const testConnection = async (clusterId: string, username: string, password: string) => {
    if (!username || !password) {
      setConnectionTestStatus(prev => ({
        ...prev,
        [clusterId]: { testing: false, success: false, error: 'Username and password required' }
      }));
      return;
    }

    setConnectionTestStatus(prev => ({ ...prev, [clusterId]: { testing: true } }));

    try {
      const response = await fetch(`/api/app-users/clusters/${clusterId}/test-connection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const result = await response.json();
      setConnectionTestStatus(prev => ({
        ...prev,
        [clusterId]: { testing: false, success: result.success, error: result.success ? undefined : result.error },
      }));

      if (result.success) {
        if (connectionTestTimers.current[clusterId]) clearTimeout(connectionTestTimers.current[clusterId]);
        connectionTestTimers.current[clusterId] = setTimeout(() => {
          setConnectionTestStatus(prev => ({ ...prev, [clusterId]: { testing: false } }));
          delete connectionTestTimers.current[clusterId];
        }, 3000);
      }
    } catch {
      setConnectionTestStatus(prev => ({
        ...prev,
        [clusterId]: { testing: false, success: false, error: 'Failed to test connection' },
      }));
    }
  };

  const handleAddUser = async (userForm: UserFormState) => {
    try {
      const createPayload: CreateAppUserInput = {
        name: userForm.username,
        email: userForm.email,
        role: userForm.role,
        password: userForm.password,
      };

      const response = await fetch('/api/app-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createPayload),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(`Failed to create user: ${error.error}`);
        return;
      }

      const newUser = await response.json();

      if (userForm.clusterAccess.length > 0) {
        const accessResponse = await fetch(`/api/users/${newUser.id}/cluster-access`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clusterAccess: userForm.clusterAccess }),
        });
        if (!accessResponse.ok) {
          const error = await accessResponse.json();
          logger.error('[handleAddUser] Failed to set cluster access:', error);
          toast.error(`User created but failed to set cluster access: ${error.error || 'Unknown error'}`);
        }
      }

      await reloadUsers();
      setIsAddUserDialogOpen(false);
      setUserFormInitialValues(defaultAppUserFormValues);
    } catch (error) {
      logger.error('[SecurityManagement] Error creating user:', error);
      toast.error('Failed to create user');
    }
  };

  const handleEditUser = async (userForm: UserFormState) => {
    if (!selectedUser) return;

    try {
      const updateData: UpdateAppUserInput = { name: userForm.username, email: userForm.email, role: userForm.role };
      if (userForm.password) {
        updateData.password = userForm.password;
      }

      const response = await fetch(`/api/app-users/${selectedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      if (!response.ok) {
        const error = await response.json();
        toast.error(`Failed to update user: ${error.error}`);
        return;
      }

      const accessResponse = await fetch(`/api/users/${selectedUser.id}/cluster-access`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clusterAccess: userForm.clusterAccess }),
      });

      if (!accessResponse.ok) {
        const error = await accessResponse.json();
        logger.error('[handleEditUser] Failed to update cluster access:', error);
        toast.error(`Failed to update cluster access: ${error.error}`);
        return;
      }

      setIsEditUserDialogOpen(false);
      setSelectedUser(null);
      await reloadUsers();
      setUserFormInitialValues(defaultAppUserFormValues);
    } catch (error) {
      logger.error('[SecurityManagement] Error updating user:', error);
      toast.error('Failed to update user');
    }
  };

  const handleDeleteUser = async () => {
    if (!selectedUser) return;

    try {
      const response = await fetch(`/api/app-users/${selectedUser.id}`, { method: 'DELETE' });
      if (!response.ok) {
        const error = await response.json();
        toast.error(`Failed to delete user: ${error.error}`);
        return;
      }
      setPlatformUsers(platformUsers.filter(user => user.id !== selectedUser.id));
      setIsDeleteUserDialogOpen(false);
      setSelectedUser(null);
    } catch (error) {
      logger.error('[SecurityManagement] Error deleting user:', error);
      toast.error('Failed to delete user');
    }
  };

  const openEditDialog = useCallback(async (user: PlatformUser) => {
    setSelectedUser(user);
    setUserFormInitialValues({
      username: user.username,
      email: user.email,
      role: user.role as UserFormState["role"],
      password: "",
      confirmPassword: "",
      clusterAccess: [],
    });

    try {
      const response = await fetch(`/api/users/${user.id}/cluster-access`);
      if (response.ok) {
        const access: ClusterAccessResponse[] = await response.json();
        setUserFormInitialValues((prev) => ({
          ...prev,
          clusterAccess: access.map(a => ({ clusterId: a.clusterId, chUsername: a.chUsername || undefined, chPassword: '' })),
        }));
      }
    } catch (error) {
      logger.error('[SecurityManagement] Error fetching user cluster access:', error);
    }

    setIsEditUserDialogOpen(true);
  }, []);

  const openDeleteDialog = (user: PlatformUser) => {
    setSelectedUser(user);
    setIsDeleteUserDialogOpen(true);
  };

  const openAddDialog = () => {
    setUserFormInitialValues(defaultAppUserFormValues);
    setConnectionTestStatus({});
    setIsAddUserDialogOpen(true);
  };

  const closeAddDialog = (open: boolean) => {
    setIsAddUserDialogOpen(open);
    if (!open) {
      setUserFormInitialValues(defaultAppUserFormValues);
      setConnectionTestStatus({});
    }
  };

  const closeEditDialog = (open: boolean) => {
    setIsEditUserDialogOpen(open);
    if (!open) {
      setSelectedUser(null);
      setUserFormInitialValues(defaultAppUserFormValues);
      setConnectionTestStatus({});
    }
  };

  const columns = useMemo<ColumnDef<PlatformUser>[]>(() => [
    {
      accessorKey: "username",
      header: "Username",
      size: 130,
      cell: ({ getValue }) => <span className="font-medium">{getValue<string>()}</span>,
    },
    {
      accessorKey: "email",
      header: "Email",
      size: 180,
    },
    {
      accessorKey: "role",
      header: "Role",
      size: 80,
      meta: { truncate: false as const },
      cell: ({ getValue }) => <Badge variant="secondary">{getValue<string>()}</Badge>,
    },
    {
      id: "clusterAccess",
      header: "Accessible Clusters",
      size: 160,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-1">
          {row.original.clusterAccess && row.original.clusterAccess.length > 0 ? (
            row.original.clusterAccess.map((access) => (
              <Badge key={access.clusterId} variant="outline" className="text-xs">{access.clusterName}</Badge>
            ))
          ) : (
            <span className="text-xs text-gray-400">No clusters</span>
          )}
        </div>
      ),
    },
    {
      id: "chUsers",
      header: "CH Users",
      size: 140,
      meta: { truncate: false as const },
      cell: ({ row }) => (
        <div className="flex flex-col gap-1">
          {row.original.clusterAccess && row.original.clusterAccess.length > 0 ? (
            row.original.clusterAccess.map((access) => (
              <div key={access.clusterId} className="text-xs">
                <span className="text-gray-600">{access.clusterName}:</span>{' '}
                <span className="font-mono text-blue-600">
                  {access.chUsername || <span className="text-gray-400 italic">not set</span>}
                </span>
              </div>
            ))
          ) : (
            <span className="text-xs text-gray-400">-</span>
          )}
        </div>
      ),
    },
    {
      accessorKey: "status",
      header: "Status",
      size: 80,
      meta: { truncate: false as const },
      cell: ({ getValue }) => (
        <Badge className={getValue<string>() === "active" ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-800"}>
          {getValue<string>()}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      size: 80,
      meta: { align: "right" as const, truncate: false as const },
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEditDialog(row.original)}>
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => openDeleteDialog(row.original)}>
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ),
    },
  ], [openEditDialog]);

  const activeUsers = platformUsers.filter(u => u.status === "active").length;

  return (
    <div className="p-8 space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Total Users</span>
          <span className="text-base text-gray-900 dark:text-white">{platformUsers.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <CheckCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
          <span className="text-base text-gray-700 dark:text-gray-300">Active Users</span>
          <span className="text-base text-gray-900 dark:text-white">{activeUsers}</span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between mb-6">
            <CardTitle>Platform Users</CardTitle>
            <Button className="bg-gray-900 hover:bg-gray-800" onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
          </div>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filteredUsers}
            emptyMessage="No users found."
          />
        </CardContent>
      </Card>

      <AddUserDialog
        open={isAddUserDialogOpen}
        onOpenChange={closeAddDialog}
        clusters={clusters}
        chUsers={chUsers}
        isLoadingChUsers={isLoadingChUsers}
        initialValues={userFormInitialValues}
        connectionTestStatus={connectionTestStatus}
        onConnectionTestStatusChange={setConnectionTestStatus}
        onSubmit={handleAddUser}
        onTestConnection={testConnection}
      />

      <EditUserDialog
        open={isEditUserDialogOpen}
        onOpenChange={closeEditDialog}
        clusters={clusters}
        chUsers={chUsers}
        isLoadingChUsers={isLoadingChUsers}
        initialValues={userFormInitialValues}
        connectionTestStatus={connectionTestStatus}
        onConnectionTestStatusChange={setConnectionTestStatus}
        onSubmit={handleEditUser}
        onTestConnection={testConnection}
      />

      <DeleteUserDialog
        open={isDeleteUserDialogOpen}
        onOpenChange={setIsDeleteUserDialogOpen}
        selectedUser={selectedUser}
        onConfirm={handleDeleteUser}
      />
    </div>
  );
}
