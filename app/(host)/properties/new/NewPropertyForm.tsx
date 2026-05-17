'use client';

import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createPropertySchema, type CreatePropertyInput } from '@/lib/validators';

export function NewPropertyForm() {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<CreatePropertyInput>({
    resolver: zodResolver(createPropertySchema),
    defaultValues: { name: '' },
  });

  async function onSubmit(values: CreatePropertyInput) {
    const res = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    if (!res.ok) {
      setError('name', { message: 'Could not create property. Try again.' });
      return;
    }
    const data = (await res.json()) as { property: { id: string } };
    router.push(`/properties/${data.property.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="surface-card space-y-5 p-7">
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm font-medium text-charcoal">
          Name
        </label>
        <input
          id="name"
          type="text"
          autoFocus
          maxLength={80}
          placeholder="Beach cottage"
          className="field-input"
          {...register('name')}
        />
        {errors.name?.message && (
          <p className="text-xs text-red-700">{errors.name.message}</p>
        )}
      </div>
      <button type="submit" disabled={isSubmitting} className="btn-primary w-full">
        {isSubmitting ? 'Creating…' : 'Create property'}
      </button>
    </form>
  );
}
