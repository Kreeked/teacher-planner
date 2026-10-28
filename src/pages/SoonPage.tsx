export function SoonPage({ title, text, color }: { title: string; text: string; color: string }) {
  return (
    <div className="page">
      <main className="main">
        <h1>{title}</h1>
        <section className="empty" style={{ background: `var(--${color})` }}>
          <div>
            <h2>Скоро</h2>
            <p>{text}</p>
          </div>
        </section>
      </main>
    </div>
  )
}
