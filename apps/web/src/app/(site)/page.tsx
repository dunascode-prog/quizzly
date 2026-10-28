import Link from "next/link";
import { Icon, type IconName } from "@/components/Icon";
import { Phone } from "@/components/Phone";
import { PlayQrCode } from "@/components/PlayQrCode";
import { ScrollReveal } from "@/components/ScrollReveal";
import { IPHONE_WAITLIST_URL, PLAY_STORE_URL } from "@/lib/site";

// Landing page: docs/WEB.md §2, built from docs/reference/landing.html.

function StoreButton({ inverted = false }: { inverted?: boolean }) {
  return (
    <a className={`store${inverted ? " inv" : ""}`} href={PLAY_STORE_URL} rel="noopener">
      <span className="store-dot">
        <Icon name="download" size={22} strokeWidth={2.2} />
      </span>
      <span className="store-text">
        <small>Free during beta</small>
        <strong>Get it on Google Play</strong>
      </span>
      <span className="store-arrows" aria-hidden="true">
        ›››
      </span>
    </a>
  );
}

function WaitlistButton({ inverted = false, label }: { inverted?: boolean; label: string }) {
  return (
    <Link className={`waitlist${inverted ? " inv" : ""}`} href={IPHONE_WAITLIST_URL} prefetch={false}>
      <Icon name="apple" size={20} />
      {label}
    </Link>
  );
}

function SectionHead({ title, lead }: { title: React.ReactNode; lead?: string }) {
  return (
    <div className="sec-head">
      <h2 className="disp h-sec">{title}</h2>
      {lead && <p className="lead">{lead}</p>}
    </div>
  );
}

function Ticks({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="ticks">
      {items.map((item, i) => (
        <li key={i}>
          <span className="tick">
            <Icon name="check" size={14} strokeWidth={3} />
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

const loopSteps = [
  ["Upload your notes", "Slides, PDFs or photos. No past questions needed."],
  ["Get fresh questions", "Objectives, fill-in-the-gaps and theory, written from your notes."],
  ["Practise anywhere", "Five minutes on the bus, ten between lectures. Works offline."],
  ["See why, then go again", "Every answer explains the principle. Weak topics come back first."],
];

const places = ["On the bus", "In traffic", "Between lectures", "In the queue", "Before bed"];

const howCards: { title: string; body: string; screen: string; alt: string; bottom?: boolean }[] = [
  {
    title: "Upload",
    body: "Add lecture slides, a PDF, or photos of a classmate's notebook. Quizzly reads them, even handwriting, and splits them into topics.",
    screen: "04-upload-sheet",
    alt: "Add notes sheet",
    bottom: true,
  },
  {
    title: "Understand",
    body: "Open any topic for a clear explanation with examples, key terms and common mistakes. Choose Standard, Simple or Exam-focused.",
    screen: "07-topic-explanation",
    alt: "Topic explanation",
  },
  {
    title: "Practise, again and again",
    body: "Fresh multiple choice, fill-in-the-blank and theory questions every round, like your lecturer sets. See why each answer is right, with the page it came from.",
    screen: "10-practice-question-feedback",
    alt: "Practice question",
  },
];

const features: { icon: IconName; title: string; body: string; screen: string; alt: string; dark?: boolean }[] = [
  {
    icon: "pen",
    title: "Theory answers, marked",
    body: "Write your answer and get marks per point, with what you missed and a model answer.",
    screen: "11-theory-answer-marked",
    alt: "Theory answer marked against a rubric",
  },
  {
    icon: "cards",
    title: "Flashcards",
    body: "Flip through key terms from any topic. The ones you miss come back in your Daily 5.",
    screen: "25b-flashcards-back",
    alt: "Flashcard showing an answer",
  },
  {
    icon: "quote",
    title: "Past questions",
    body: "Upload an old paper and practise new questions in the same style, from your notes.",
    screen: "26b-quiz-setup-past-style",
    alt: "Quiz setup in past-question style",
  },
  {
    icon: "offline",
    title: "Study offline",
    body: "Save a whole course to your phone before you lose data or light.",
    screen: "28c-offline-saved",
    alt: "Course saved for offline",
  },
  {
    icon: "cards",
    title: "Topics, not 60 slides",
    body: "Every document is split into clear topics with page ranges, so you can study one at a time.",
    screen: "06-document-outline",
    alt: "Document outline with topics",
  },
  {
    icon: "moon",
    title: "Easy on your eyes",
    body: "Dark mode turns on by itself at night. Every screen is designed for both.",
    screen: "14-today",
    alt: "Today screen in dark mode",
    dark: true,
  },
];

const realities: { icon: IconName; title: string; body: string }[] = [
  { icon: "phone", title: "Light on your phone", body: "Designed for 2 GB Android phones. Small downloads, no heavy animations." },
  {
    icon: "offline",
    title: "Offline when you need it",
    body: "Explanations and quizzes you’ve opened stay on your phone. Answers sync when you’re back online.",
  },
  { icon: "download", title: "Low-data mode", body: "Downloads only on Wi‑Fi and shows how many MB you used this week." },
  {
    icon: "lock",
    title: "Your files stay yours",
    body: "Your uploads are private. We never train AI on your notes. Delete your account anytime.",
  },
];

const faqs = [
  [
    "Do I need past questions?",
    "No. Quizzly writes new exam-style questions from your own notes, so you can practise any topic for as many rounds as you need. If you do have past questions, upload them and Quizzly will copy their style.",
  ],
  [
    "Is Quizzly free?",
    "Yes. Quizzly is free while we’re in beta, with daily limits so it stays free for everyone. Paid plans with higher limits may come later; we’ll tell you before anything changes.",
  ],
  [
    "Which schools does it work for?",
    "Any university, polytechnic or college of education. We’re launching at UNILAG first, and your notes are what matter, so it works for any course.",
  ],
  [
    "Can it read handwritten notes?",
    "Yes, from clear photos of printed or neat handwritten notes. If some pages are hard to read, Quizzly tells you which ones so you can retake them.",
  ],
  [
    "Will the answers be correct?",
    "Quizzly only uses your notes and shows the page for every answer, so you can check. Anything not from your notes is clearly labelled, and you can report a wrong question in two taps.",
  ],
  [
    "Is this for cheating in exams?",
    "No. Quizzly is for revision before the exam: understanding topics and practising questions. It has no live-exam features.",
  ],
  [
    "Can I practise without data?",
    "Yes. Save a course for offline and practise anywhere: on the bus, in traffic, during a power cut. Your answers sync when you’re back online.",
  ],
];

export default function LandingPage() {
  return (
    <>
      {/* 2. Hero */}
      <section className="wrap g2 hero-grid hero" aria-labelledby="hero-title">
        <div className="col hero-copy">
          <span className="eyebrow">Practise anywhere, anytime</span>
          <h1 id="hero-title" className="disp h-hero">
            Practise on the go
            <br />
            until it <span className="hl">clicks.</span>
          </h1>
          <p className="lead">
            Don’t wait for past questions. Upload your lecture notes and Quizzly writes fresh exam-style questions from
            them, round after round. Practise on the bus, in traffic or between lectures until you understand the
            principles, not just memorise answers.
          </p>
          <div className="cta-row stack-m">
            <StoreButton />
            <WaitlistButton label="iPhone: join the waitlist" />
          </div>
          <ul className="facts">
            <li>
              <Icon name="repeat" size={18} />
              New questions every round
            </li>
            <li>
              <Icon name="offline" size={18} />
              Works offline on the road
            </li>
            <li>
              <Icon name="quote" size={18} />
              Every answer explains why
            </li>
          </ul>
        </div>
        <div className="hero-art">
          <Phone
            screen="14-today"
            alt="Today screen with exam countdown and a short practice plan"
            width={220}
            className="hero-side left hide-m"
          />
          <Phone
            screen="12-results"
            alt="Results screen with weak topics to practise next"
            width={220}
            className="hero-side right hide-m"
          />
          <Phone
            screen="10-practice-question-feedback"
            alt="Practice question with instant feedback and an explanation"
            width={280}
            className="hero-main"
            eager
          />
          <span className="sticker hide-m" style={{ left: 0, top: 40, transform: "rotate(-6deg)" }}>
            <span className="dot">
              <Icon name="phone" size={15} strokeWidth={2.4} />
            </span>
            In traffic · 5 min
          </span>
          <span className="sticker ink hide-m" style={{ right: 0, top: 28, transform: "rotate(5deg)" }}>
            <span className="dot">
              <Icon name="repeat" size={15} strokeWidth={2.4} />
            </span>
            Round 4 · new questions
          </span>
          <span className="sticker hide-m" style={{ right: 0, bottom: 40, transform: "rotate(-4deg)" }}>
            <span className="dot">
              <Icon name="check" size={15} strokeWidth={3} />
            </span>
            9 / 10 · you’ve got it
          </span>
        </div>
      </section>

      {/* 2b. Practice loop */}
      <section className="wrap" style={{ paddingTop: 40 }} aria-labelledby="loop-title">
        <div className="band ink loop on-ink">
          <div className="g2">
            <div className="col" style={{ gap: 18 }}>
              <h2 id="loop-title" className="disp h-sec">
                Don’t wait for <span className="hl-inv">past questions.</span>
              </h2>
              <p className="lead">
                Past questions are hard to find, often outdated and rarely come with answers. Quizzly turns your own
                notes into as many practice rounds as you need, and every round brings new questions on the same
                principles.
              </p>
              <span className="mastery">
                <Icon name="repeat" size={18} strokeWidth={2.4} />
                Repeat until you score 80% on every topic
              </span>
            </div>
            <ol className="steps">
              {loopSteps.map(([title, body], i) => (
                <li key={title}>
                  <span className="step-num" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="step-text">
                    <strong>{title}</strong>
                    <span>{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
          <div className="places-row">
            <span className="places-label" id="places-label">
              Practise wherever you are:
            </span>
            <ul className="places" aria-labelledby="places-label">
              {places.map((p) => (
                <li key={p} className="chip">
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* 3. Schools strip */}
      <section className="wrap" style={{ paddingTop: 48 }} aria-label="Where Quizzly works">
        <p className="strip">
          <strong>Launching at UNILAG</strong>
          <span aria-hidden="true">·</span>
          <span>Coming next to UI, OAU, ABU, UNN and polytechnics</span>
          <span aria-hidden="true">·</span>
          <span>Any PDF, PPTX or photo of notes</span>
        </p>
      </section>

      {/* 4. How it works */}
      <section id="how" className="wrap sec col" style={{ gap: 44 }}>
        <SectionHead
          title={
            <>
              From slides to <span className="hl">exam practice</span> in minutes
            </>
          }
          lead="No more reading bullet points that only made sense in the lecture hall."
        />
        <ol className="g3" style={{ margin: 0, padding: 0, listStyle: "none" }}>
          {howCards.map((c, i) => (
            <li key={c.title} className="card">
              <span className="num" aria-hidden="true">
                {i + 1}
              </span>
              <h3 className="disp">{c.title}</h3>
              <p>{c.body}</p>
              <div className={`crop${c.bottom ? " bottom" : ""}`}>
                <Phone screen={c.screen} alt={c.alt} width={280} />
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* 5. Citations */}
      <section className="wrap sec">
        <div className="band ink on-ink">
          <div className="g2">
            <div className="col" style={{ gap: 26 }}>
              <SectionHead
                title={
                  <>
                    Every answer shows its <span className="hl-inv">page</span>
                  </>
                }
                lead="Quizzly only uses your notes. Tap any p. 12 chip to see the original page. If something isn’t in your notes, it says so."
              />
              <Ticks
                items={[
                  "Explanations, questions and chat answers all cite your slides",
                  "A clear “Not in your notes” label for anything extra",
                  "Report a wrong question in two taps. We fix it for everyone",
                ]}
              />
            </div>
            <div className="phones">
              <Phone screen="08-chat-with-notes" alt="Chat with notes showing page citations" width={270} />
              <Phone
                screen="29-page-viewer"
                alt="Original page viewer with cited passage highlighted"
                width={270}
                className="hide-m"
                style={{ marginTop: 60 }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 6. Features bento */}
      <section id="features" className="wrap sec col" style={{ gap: 44 }}>
        <SectionHead
          title={
            <>
              Everything you need for <span className="hl">exam week</span>
            </>
          }
          lead="Built around how Nigerian university exams are actually set: objectives, fill-in-the-gaps and long theory questions."
        />
        <div className="bento">
          {features.map((f) => (
            <article key={f.title} className="card">
              <span className="icon-dot">
                <Icon name={f.icon} size={22} />
              </span>
              <h3 className="disp">{f.title}</h3>
              <p>{f.body}</p>
              <div className="crop">
                <Phone screen={f.screen} alt={f.alt} width={250} darkOnly={f.dark} />
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 7. Habits */}
      <section className="wrap sec">
        <div className="g2">
          <div className="phones" style={{ gap: 18 }}>
            <Phone screen="15-daily5-done" alt="Daily 5 done and weekly goal" width={260} />
            <Phone
              screen="16-celebrate"
              alt="Topic mastered celebration"
              width={260}
              className="hide-m"
              style={{ marginTop: 70 }}
            />
          </div>
          <div className="col order-m-first" style={{ gap: 26 }}>
            <SectionHead
              title={
                <>
                  A little, <span className="hl">every day</span>
                </>
              }
              lead="Open Quizzly and see how ready you are for your next exam, plus a short plan for today."
            />
            <Ticks
              items={[
                <>
                  <b>Daily 5:</b> five quick questions on what you’re about to forget
                </>,
                <>
                  <b>Weekly goal</b> instead of a streak. Missing a day never resets your week
                </>,
                <>
                  <b>Exam countdown</b> and a readiness score for every course
                </>,
                <>
                  <b>Kind reminders</b> only if you haven’t studied, never after 11 PM
                </>,
              ]}
            />
          </div>
        </div>
      </section>

      {/* 8. Sharing */}
      <section id="share" className="wrap sec">
        <div className="band surface">
          <div className="g2">
            <div className="col" style={{ gap: 26 }}>
              <SectionHead
                title={
                  <>
                    One upload. <span className="hl">Whole class.</span>
                  </>
                }
                lead="Share a course with your coursemates in Quizzly or with a link. They get the explanations and questions instantly, with no uploading and no waiting."
              />
              <div className="g2 share-boxes">
                <div className="share-box">
                  <h3>They get</h3>
                  <p>Outlines, explanations, practice questions, and notes you add later</p>
                </div>
                <div className="share-box">
                  <h3>Stays private</h3>
                  <p>Your scores, chats, progress and original files</p>
                </div>
              </div>
              <p className="note">
                <Icon name="bell" size={20} />
                Coursemates see your share in real time, and can decline or block anytime.
              </p>
            </div>
            <div className="phones" style={{ gap: 18 }}>
              <Phone screen="19-share-course" alt="Share a course sheet" width={260} />
              <Phone
                screen="20-join-course"
                alt="Join a shared course"
                width={260}
                className="hide-m"
                style={{ marginTop: 70 }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* 9. Built for our realities */}
      <section className="wrap sec col" style={{ gap: 44 }}>
        <SectionHead
          title={
            <>
              Built for <span className="hl">our</span> realities
            </>
          }
          lead="Expensive data, shared phones, power cuts, strikes and packed lecture halls."
        />
        <div className="g4">
          {realities.map((r) => (
            <div key={r.title} className="fact">
              <span className="icon-dot soft">
                <Icon name={r.icon} size={22} />
              </span>
              <h3 className="disp">{r.title}</h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* 10. FAQ */}
      <section id="faq" className="wrap sec col" style={{ gap: 36 }}>
        <SectionHead
          title={
            <>
              Questions, <span className="hl">answered</span>
            </>
          }
        />
        <div className="g2 faq">
          {faqs.map(([q, a], i) => (
            <details key={q} open={i === 0}>
              <summary>
                {q}
                <span className="chev">
                  <Icon name="chevron" size={18} />
                </span>
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* 11. Final CTA */}
      <section id="get" className="wrap sec" aria-labelledby="get-title">
        <div className="band ink get on-ink stack-m">
          <div className="get-copy">
            <h2 id="get-title" className="disp h-sec">
              Start with this week’s <span className="hl-inv">slides.</span>
            </h2>
            <p className="lead">
              Install Quizzly, upload one lecture, and start your first practice round in about three minutes. Then
              keep going wherever you are.
            </p>
            <div className="cta-row stack-m">
              <StoreButton inverted />
              <WaitlistButton inverted label="iPhone waitlist" />
            </div>
          </div>
          <div className="qr-block hide-m">
            <PlayQrCode url={PLAY_STORE_URL} />
            <span>Scan to download</span>
          </div>
        </div>
      </section>

      <ScrollReveal />
    </>
  );
}
