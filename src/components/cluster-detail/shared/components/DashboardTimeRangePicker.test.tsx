import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DashboardTimeRangePicker } from './DashboardTimeRangePicker';

describe('DashboardTimeRangePicker', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits a relative preset immediately', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <DashboardTimeRangePicker
        value={{ mode: 'relative', preset: 'last-1h' }}
        timezone="UTC"
        onChange={handleChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Last 1 hour' }));
    await user.click(screen.getByRole('button', { name: 'Last 15 mins' }));

    expect(handleChange).toHaveBeenCalledWith({ mode: 'relative', preset: 'last-15m' });
  });

  it('closes the popover after selecting a relative preset', async () => {
    const user = userEvent.setup();

    render(
      <DashboardTimeRangePicker
        value={{ mode: 'relative', preset: 'last-1h' }}
        timezone="UTC"
        onChange={vi.fn()}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Last 1 hour' }));
    await user.click(screen.getByRole('button', { name: 'Last 15 mins' }));

    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
  });

  it('prefills absolute inputs from the selected relative preset using the current time', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-07T12:34:56Z'));

    render(
      <DashboardTimeRangePicker
        value={{ mode: 'relative', preset: 'last-1h' }}
        timezone="UTC"
        onChange={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Last 1 hour' }));

    expect(screen.getByLabelText('From')).toHaveValue('2026-05-07T11:34');
    expect(screen.getByLabelText('To')).toHaveValue('2026-05-07T12:34');
  });

  it('validates and applies an absolute range', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <DashboardTimeRangePicker
        value={{ mode: 'relative', preset: 'last-1h' }}
        timezone="Asia/Seoul"
        onChange={handleChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Last 1 hour' }));
    const fromInput = screen.getByLabelText('From');
    const toInput = screen.getByLabelText('To');
    fireEvent.change(fromInput, { target: { value: '2026-03-31T09:00' } });
    fireEvent.change(toInput, { target: { value: '2026-03-31T10:00' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(handleChange).toHaveBeenCalledWith({
      mode: 'absolute',
      from: '2026-03-31T09:00',
      to: '2026-03-31T10:00',
    });
  });

  it('shows a validation error for inverted absolute ranges', async () => {
    const user = userEvent.setup();
    const handleChange = vi.fn();

    render(
      <DashboardTimeRangePicker
        value={{ mode: 'relative', preset: 'last-1h' }}
        timezone="UTC"
        onChange={handleChange}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Last 1 hour' }));
    const fromInput = screen.getByLabelText('From');
    const toInput = screen.getByLabelText('To');
    fireEvent.change(fromInput, { target: { value: '2026-03-31T10:00' } });
    fireEvent.change(toInput, { target: { value: '2026-03-31T09:00' } });
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(handleChange).not.toHaveBeenCalled();
 expect(screen.getByText('To From .')).toBeInTheDocument();
  });

  it('calls refresh handler from adjacent button', async () => {
    const user = userEvent.setup();
    const handleRefresh = vi.fn();

    render(
      <DashboardTimeRangePicker
        value={{ mode: 'relative', preset: 'last-1h' }}
        timezone="UTC"
        onChange={vi.fn()}
        onRefresh={handleRefresh}
      />
    );

    await user.click(screen.getByRole('button', { name: 'Refresh charts' }));

    expect(handleRefresh).toHaveBeenCalledTimes(1);
  });
});
