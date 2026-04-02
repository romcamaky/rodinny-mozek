function Dashboard() {
  return (
    <section className="mx-auto w-full max-w-md pb-4">
      <h1 className="text-3xl font-bold">Dashboard</h1>

      <div className="mt-5 space-y-4">
        <div
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          style={{ boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 10%, transparent)' }}
        >
          <div className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>👶</span>
            <span>Vývoj dětí</span>
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Brzy zde: sledování vývoje dětí
          </p>
        </div>

        <div
          className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm"
          style={{ boxShadow: '0 1px 3px color-mix(in srgb, var(--color-text) 10%, transparent)' }}
        >
          <div className="flex items-center gap-2 text-base font-semibold">
            <span aria-hidden>🌤️</span>
            <span>Víkendové aktivity</span>
          </div>
          <p className="mt-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            Brzy zde: doporučení na víkend
          </p>
        </div>
      </div>
    </section>
  )
}

export default Dashboard

