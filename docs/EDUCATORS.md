# For educators: why this lab teaches the way it does

This page is for teachers, professors, and instructional designers deciding whether to put the
lab in front of students, and how. It is my honest account of the pedagogy, including the parts
that are bets rather than settled findings. The lab is free and non-commercial, and it will stay
that way.

The lab itself, if you have not tried it: [claybits.xyz/tiny-ai](https://claybits.xyz/tiny-ai).
One neuron in the browser. A virtual patient, a medicine dose in mg, and a set of knobs the
student turns until the model's predictions match the data. A 3D scene sits beside a reading
column, and the two stay in sync: what the text is talking about is what the scene is showing.
It adapts material from DS 6042 (Prof. Daniel Graham, University of Virginia), rebuilt for
complete beginners with no programming and no calculus.

## Learning by building

The core of the lab is Seymour Papert's constructionism, straight down the Logo turtle lineage.
Papert's insight was that people learn ideas by building something real with them: turtle
graphics taught programming not by explaining loops but by letting children draw, and discover
that a square wants a loop. The knowledge arrives because the project demands it.

Here the thing being built is a working model. The student hand-trains a straight line, feels it
fail on curved data (the data is arranged so that a straight line genuinely cannot earn the
fifth star, and the student is meant to fight for it and lose), then adds a bend and trains
again. Loss is a score on the screen; turning a knob moves it. No vocabulary arrives before the
experience it names. "Weight" shows up after the student has been adjusting one for ten minutes.

This ordering is the whole design. The lab's climactic reveal is that backpropagation is an
automatic hand turning the same knobs the student has been turning, downhill on the same score.
That sentence is a shrug if you read it cold. It lands only on someone who has been that hand,
who knows in their fingers what "adjust the weights to reduce the error" costs, and who
therefore understands exactly what is being automated. I would rather a student leave knowing
that one thing deeply than leave with a vocabulary list.

## A teaching assistant in the room

Years ago I co-founded Piper Learning, where we built Minecraft-based hardware kits. The part of
that work I have never stopped thinking about was the teaching software: it was an early example
of an AI teaching assistant in a box. The software could see what the learner was physically
doing, like plugging a wire into the wrong row of a breadboard, and it guided the next step
multimodally, through the 3D world, visuals, sound, text, and diagrams that lived and updated
rather than sitting inert on a page. The assistant was not a help menu. It was in the room.

The tutor in this lab is the same idea rebuilt for the LLM era. When a student connects their AI
to the lab, the AI gets real presence on the page: a labelled cursor that moves, the ability to
highlight a sentence with a blinking caret, a voice in the student's ear if they want one. And
it gets real sight of what the student is doing: which knob they are hovering, what text they
selected, what their current model looks like, where they have been stuck. The mental model I
build toward is a collaborator in a shared document, not a chatbot in a sidebar. A tutor that
can say "this knob, the one under your cursor, what happens to the score if you turn it up?"
is a different instrument from one that can only answer questions about knobs in general.

(One note on vocabulary, since the lab and its sister project borrow words like cell, wire, and
synapse: that is metaphor, chosen because novices already have intuitions for physical objects.
Nothing here is a claim about biology, and I would ask you not to present it as one.)

## Lean in, don't ban

The default posture toward LLMs in education right now is restriction, and I understand why:
handed a solver, many students will let it solve. But banning does not make the solver go away.
It just guarantees that students meet AI without any structure around the meeting.

This lab takes the opposite bet. If you lower the barrier to a good tutoring pattern, students
will use AI in a way that actually helps them learn. The pattern I mean is old and well
understood: Socratic, one question at a time, never gives the answer, meets the student where
they are. The problem has never been that this pattern is unknown. The problem is that setting
it up costs effort exactly when a student is stuck and wants relief, so the path of least
resistance is "just tell me."

So the design makes the effective pattern the easy pattern. One click copies an invite. One
paste into the AI the student already uses, and that AI reads its briefing and becomes a guide
that points and asks rather than solves. The student does nothing harder than pasting. If the
bet is right, it generalizes: the invite-a-tutor move works for any lab, any subject, any page
willing to write a briefing for it.

## The tutor's ceiling is the pedagogy

The briefing asks the AI to be Socratic, but I do not rely on asking. The page enforces a
ceiling in code: the tutor can point, highlight, and talk, and can never click, type, or change
the student's work. There is no code path for it. However persuasive the student is, however
confused the model gets, the hands on the knobs are the student's.

The briefing adds the second half: no answers. Not a knob value, not a quiz number, not the
knowledge-check sentence. A tutor that can do the exercise for you is not a tutor, it is a
vending machine with better manners. Even the lab's own knowledge check keeps this honest: the
page never grades the student's sentence. Their own AI does, in their own chat, against a rubric
the page hands over, and it is briefed to respond with one question that leads toward whatever
is missing rather than a corrected answer.

The tone model for all of it is Feynman: plain words, analogies before vocabulary, one question
at a time, celebrate honestly and then raise the bar one notch.

## Privacy and the trust footprint

Students bring the AI they already talk to. The lab does not stand up its own chatbot, and this
is a feature, not a shortcut. When a page embeds its own AI, every student conversation flows to
whatever provider the page chose, under terms the student never picked. Here the conversation
stays inside the AI relationship, account, and data policy the student or their school already
chose. The lab never sees it. For K-12 and university settings, where introducing a new AI
vendor means data agreements, parental consent, and procurement review, this matters: the lab
adds no new vendor to that list.

The paste-based flow involves no connection at all: the student copies text out and pastes
replies in. The optional live session, the one where the tutor's cursor actually moves, relays
small page-state snapshots (knob values, pointer position, selected text) through a public
message relay, guarded by a room code. A room is nothing but an ephemeral message channel: the
relay drops messages after a few hours, and the lab stores no transcript. The tutor
conversation itself never touches the lab's infrastructure. The worst case for a leaked room
code is honest and small: a stranger could see those page-state snapshots and move a cursor on
the student's screen, because pointing, highlighting, and talking are all the channel can carry.
No name, no account, and no conversation ever crosses it.

## No lock-in, with an opinionated default

Bring-your-own-AI means the lab respects the student's, or the school's, choice of model. It
works the same with Claude, ChatGPT, or any capable model that can read a briefing and hold to
it, in an app or in voice mode.

I do have a recommendation, and I will state it plainly rather than pretend neutrality. For
educators setting this up for a class, my current default is a free Claude for Education
account, because you get frontier models from a provider that treats safety as a core value,
and in my experience educational accuracy tracks reasoning quality: weaker models are more
likely to give a confidently wrong explanation of gradient descent to a student who cannot yet
catch it. The general principle I would offer any educator, whatever provider you choose: use
the most capable frontier models that hold the highest safety standards, not weaker or
unaligned ones. The students least equipped to detect a bad explanation are the ones we hand
these tools to first. But this is a default, not a requirement, and nothing in the lab checks
which AI showed up.

## Voice, and the shared-document mental model

The experience I am building toward is co-presence, the way a shared Google Doc feels when a
collaborator's cursor is moving in it. The tutor is in the document with you. Voice mode
completes it: a student keeps their hands on the knobs and just talks, and the tutor talks back
while its cursor points at the thing under discussion, like a lab partner sitting beside them.
For students who freeze at a blank chat box, or who think faster aloud, this is a genuinely
different experience from typing questions into a sidebar.

Rooms extend the same metaphor to people. A teacher can join a student's live session from the
shared link and watch the same page state the tutor sees: where the student's pointer is, what
their model looks like, where they have stalled. Same document, more collaborators.

## What to measure

The lab carries its own instruments: a pre/post confidence measure taken before the student
knows what the task involves and again at the end, completion telemetry, and an NPS-style
feedback dial. Early user tests (n=4, so read this as direction, not evidence) showed 100%
completion and positive NPS, but flat confidence movement. People finished, and enjoyed it, and
did not yet feel more capable.

I am sharing that flat line deliberately, because it is exactly the gap a good tutor should
move. Confidence grows in the moments a learner gets unstuck and knows why, and those are the
moments a Socratic tutor exists for. If you run the lab with a class, the natural experiment is
built in: one section with the tutor, one without, same pre/post measure. I would genuinely
like to see your numbers, whichever way they point.

## Using it in a classroom

The whole flow is one link:

1. Share the lab URL with students: `https://claybits.xyz/tiny-ai`.
2. Students click the tutor badge at the top of the page, copy the invite with one click, and
   paste it into the AI they already use (app or voice mode). Their AI reads the briefing and
   becomes their guide.
3. They work. The tutor points, highlights, and asks. It never touches their knobs.

For live sessions, the page generates a short room code, and the copied tutor link carries it
automatically. A teacher can join a student's room from that same shared link to see what the
student and tutor see. No accounts, nothing to install, and the paste-only flow works even
where live connections are blocked.

One practical caveat for a full class. Live sessions relay through ntfy.sh, a free public
message service that limits how many messages an IP may send per day. A single student's
session is small (about two messages a minute of active work, so roughly forty for a twenty
minute session), but thirty students behind one school NAT share that allowance and can
exhaust it. If you are running this with a whole class at once, either have students use the
paste flow, which sends nothing at all, or host the relay yourself: the lab accepts a
`?relay=` parameter pointing at your own ntfy instance, and `staging/tiny-ai/tutor-bridge/`
is a small self-hosted alternative with a proper MCP connector. When the public relay does
start refusing, the page says so rather than going quiet.

If you use this with students, tell me how it went. The feedback dial at the bottom of the lab
reaches me directly, and GitHub issues at
[github.com/grassyhilltop/tiny-ai](https://github.com/grassyhilltop/tiny-ai) work for anything
longer. Credit where it is due: the lab adapts DS 6042 (Prof. Daniel Graham, University of
Virginia), and its soul, to whatever extent it has one, belongs to Seymour Papert.
