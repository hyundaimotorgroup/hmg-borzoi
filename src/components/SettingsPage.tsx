"use client";

import { useEffect } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Settings,
  Palette,
  Save,
  Zap,
  Activity,
  TrendingUp
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useSettings } from "@/contexts/SettingsContext";
import {
  displaySettingsSchema,
  generalSettingsSchema,
  themeOptions,
  timezoneOptions,
  type DisplaySettingsFormValues,
  type GeneralSettingsFormValues,
} from "@/lib/validation";

function toGeneralSettingsFormValues(values: {
  appName: string;
  defaultCluster: string;
  refreshInterval: string;
  cacheTTL: string;
  timezone: string;
  language: string;
}): GeneralSettingsFormValues {
  return {
    ...values,
    timezone: timezoneOptions.includes(values.timezone as (typeof timezoneOptions)[number])
      ? (values.timezone as GeneralSettingsFormValues["timezone"])
      : "UTC",
  };
}

function toDisplaySettingsFormValues(values: {
  theme: string;
  compactMode: boolean;
  showGridLines: boolean;
  defaultChartType: string;
}): DisplaySettingsFormValues {
  return {
    ...values,
    theme: themeOptions.includes(values.theme as (typeof themeOptions)[number])
      ? (values.theme as DisplaySettingsFormValues["theme"])
      : "system",
  };
}

export function SettingsPage() {
  const {
    generalSettings,
    displaySettings,
    updateGeneralSettings,
    updateDisplaySettings,
    saveAllSettings
  } = useSettings();
  const generalForm = useForm<GeneralSettingsFormValues>({
    resolver: zodResolver(generalSettingsSchema),
    defaultValues: toGeneralSettingsFormValues(generalSettings),
  });
  const displayForm = useForm<DisplaySettingsFormValues>({
    resolver: zodResolver(displaySettingsSchema),
    defaultValues: toDisplaySettingsFormValues(displaySettings),
  });

  useEffect(() => {
    generalForm.reset(toGeneralSettingsFormValues(generalSettings));
  }, [generalForm, generalSettings]);

  useEffect(() => {
    displayForm.reset(toDisplaySettingsFormValues(displaySettings));
  }, [displayForm, displaySettings]);

  const handleSaveGeneral = (values: GeneralSettingsFormValues) => {
    updateGeneralSettings(values);
    saveAllSettings();
    toast.success("General settings saved successfully");
  };

  const handleSaveDisplay = (values: DisplaySettingsFormValues) => {
    updateDisplaySettings(values);
    saveAllSettings();
    toast.success("Display settings saved successfully");
  };

  const applyPreset = (preset: 'realtime' | 'standard' | 'relaxed') => {
    const cacheTTL = preset === "realtime" ? "10" : preset === "standard" ? "60" : "300";
    switch (preset) {
      case 'realtime':
        toast.success("Applied Real-time Monitoring preset");
        break;
      case 'standard':
        toast.success("Applied Standard Monitoring preset");
        break;
      case 'relaxed':
        toast.success("Applied Relaxed Monitoring preset");
        break;
    }
    generalForm.setValue("cacheTTL", cacheTTL, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <div className="p-8 space-y-6">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList>
          <TabsTrigger value="general">
            <Settings className="w-4 h-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="display">
            <Palette className="w-4 h-4 mr-2" />
            Display
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-4">
          {/* Monitoring Presets */}
          <Card>
            <CardHeader>
              <CardTitle>Monitoring Presets</CardTitle>
              <CardDescription>Quick presets for common monitoring scenarios</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Button
                  variant="outline"
                  className="flex flex-col items-start h-auto p-4 space-y-2"
                  onClick={() => applyPreset('realtime')}
                >
                  <div className="flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-500" />
                    <span className="">Real-time</span>
                  </div>
                  <div className="text-xs text-left text-gray-600 dark:text-gray-400">
                    Cache: 10s
                    <br />
                    For incident response
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="flex flex-col items-start h-auto p-4 space-y-2 border-blue-300 dark:border-blue-700"
                  onClick={() => applyPreset('standard')}
                >
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <span className="">Standard</span>
                    <span className="text-xs text-blue-600 dark:text-blue-400">(Recommended)</span>
                  </div>
                  <div className="text-xs text-left text-gray-600 dark:text-gray-400">
                    Cache: 60s
                    <br />
                    Balanced performance
                  </div>
                </Button>

                <Button
                  variant="outline"
                  className="flex flex-col items-start h-auto p-4 space-y-2"
                  onClick={() => applyPreset('relaxed')}
                >
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-green-500" />
                    <span className="">Relaxed</span>
                  </div>
                  <div className="text-xs text-left text-gray-600 dark:text-gray-400">
                    Cache: 300s
                    <br />
                    For trend analysis
                  </div>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Performance Settings */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Settings</CardTitle>
              <CardDescription>Configure caching behavior</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...generalForm}>
                <form onSubmit={generalForm.handleSubmit(handleSaveGeneral)} className="space-y-4">
                  <FormField
                    control={generalForm.control}
                    name="cacheTTL"
                    render={({ field }) => (
                      <FormItem className="grid gap-2">
                        <div className="flex items-center justify-between">
                          <FormLabel htmlFor="cacheTTL">Cache TTL (seconds)</FormLabel>
                          {field.value && (
                            <span className="text-xs text-gray-500">
                              Current: <span className="text-blue-600 dark:text-blue-400">{field.value}s</span>
                            </span>
                          )}
                        </div>
                        <FormControl>
                          <Input
                            {...field}
                            id="cacheTTL"
                            type="number"
                            min="1"
                            step="1"
                            placeholder="60 (default)"
                          />
                        </FormControl>
                        <p className="text-xs text-gray-500">
                          How long to cache query results to reduce database load.
                          <br />
                          <span className="text-gray-400">Common values: 10s (real-time), 60s (standard), 300s (relaxed)</span>
                        </p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={generalForm.control}
                    name="timezone"
                    render={({ field }) => (
                      <FormItem className="grid gap-2">
                        <FormLabel htmlFor="timezone">Timezone</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {timezoneOptions.map((timezone) => (
                              <SelectItem key={timezone} value={timezone}>
                                {timezone === "UTC"
                                  ? "UTC"
                                  : timezone === "Asia/Seoul"
                                    ? "Seoul (KST)"
                                    : timezone === "Asia/Tokyo"
                                      ? "Tokyo (JST)"
                                      : timezone === "America/New_York"
                                        ? "New York (EST/EDT)"
                                        : timezone === "America/Los_Angeles"
                                          ? "Los Angeles (PST/PDT)"
                                          : "London (GMT/BST)"}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={generalForm.formState.isSubmitting}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Display Settings */}
        <TabsContent value="display" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Display Preferences</CardTitle>
              <CardDescription>Customize the appearance of your dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <Form {...displayForm}>
                <form onSubmit={displayForm.handleSubmit(handleSaveDisplay)} className="space-y-4">
                  <FormField
                    control={displayForm.control}
                    name="theme"
                    render={({ field }) => (
                      <FormItem className="grid gap-2">
                        <FormLabel htmlFor="theme">Theme</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="dark">Dark</SelectItem>
                            <SelectItem value="system">System</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={displayForm.control}
                    name="compactMode"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <FormLabel className="text-base">Compact Mode</FormLabel>
                          <p className="text-xs text-gray-500">Reduce spacing and padding</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={displayForm.control}
                    name="showGridLines"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between">
                        <div>
                          <FormLabel className="text-base">Show Grid Lines</FormLabel>
                          <p className="text-xs text-gray-500">Display grid lines on charts</p>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={displayForm.formState.isSubmitting}>
                    <Save className="w-4 h-4 mr-2" />
                    Save Settings
                  </Button>
                </form>
              </Form>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* System Info */}
      <Card>
        <CardHeader>
          <CardTitle>System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 text-sm">
            <div>
              <span className="text-gray-600">Version:</span>
              <span className="ml-2">1.0.0</span>
            </div>
            <div>
              <span className="text-gray-600">Project:</span>
              <span className="ml-2">hmg-borzoi</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
