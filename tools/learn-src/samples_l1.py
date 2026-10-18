# Sample learner answers for marking practice. Level 1, shorter task (Composition /9, SPaG /6).
# Each sample: text, our marks, what worked (with exact quotes), one thing to try, and SPaG notes (exact quotes).
T = []

def sample(sid, answer, comp, spag, why_comp, why_spag, worked, target, notes):
    return dict(id=sid, answer=answer.strip('\n'), composition=comp, spag=spag, why_composition=why_comp, why_spag=why_spag,
                worked=[dict(what=w, quote=q) for w, q in worked], target=dict(what=target[0], example=target[1]),
                spag_notes=[dict(quote=q, fix=f, why=y) for q, f, y in notes])

# ---------- A: forum post, "Is a day at the zoo worth it?" ----------
T.append(dict(id="mark-forum-zoo", title="A forum post about the zoo", level="L1", missionId="w-pandas-4", samples=[
 sample("a2", """Hi everyone,

I think a day at the zoo is worth the money, although it depends on what you like. Last summer my family went to a wildlife park and I had a brilliant time.

The main reason I would go again is the animals. You cant see giant pandas very often, and watching one eat bamboo for ten minutes was amazing. The keeper talk was good as well because she answered all our questions and told us things we didnt know.

On the other hand it was expensive. Tickets cost £14 each and we paid another £20 for lunch, which was too much. There was also a long queue for the cafe so we spent half an hour waiting.

Overall I think its worth it if you go early and take your own lunch. Has anyone else been?""",
  5, 4,
  "A clear view in the first sentence and two developed reasons with examples, in paragraphs, with a friendly forum tone and a closing question. The language is mostly simple, with limited variety, so it sits in the middle of the band.",
  "Full stops and capital letters are secure and most spelling is accurate. Apostrophes are missing from short forms and there are a few missing commas, so it is reasonably accurate.",
  [("You gave your view straight away and explained it with an example.", "watching one eat bamboo for ten minutes was amazing"), ("You finished with a question that invites replies, which suits a forum.", "Has anyone else been?")],
  ("Add more variety to your sentences by joining ideas with words such as \"although\", \"which\" or \"so that\", and add one more detail to each reason.", "For example: \"Although tickets cost £14, the keeper talk alone made the visit worthwhile.\""),
  [("You cant see", "You can't see", "A short form needs an apostrophe where letters are missing."), ("we didnt know", "we didn't know", "Another short form that needs an apostrophe."), ("I think its worth it", "I think it's worth it", "\"It's\" means \"it is\", so it needs an apostrophe."), ("On the other hand it was expensive.", "On the other hand, it was expensive.", "A comma follows an opening phrase.")]),
 sample("a1", """i think a day at the zoo is worth it. it is good because you can see animals. my favrite is the pandas they are cute and they eat bamboo all day.

the tickets was alot of money but i still liked it. we went on saturday and there was loads of people so we had to wait. The cafe was expensive to.

so i think you should go to the zoo it is fun""",
  3, 2,
  "There is a clear view and one or two relevant ideas, but little detail or explanation, no greeting or closing question, and the ending is abrupt. The sentences are short and simple.",
  "There are many errors with capital letters and full stops, several spelling mistakes and some grammar slips. The meaning can still be followed, which keeps it in the lowest band rather than below it.",
  [("You said what you thought in your first sentence.", "i think a day at the zoo is worth it"), ("You gave an example of something you liked, using a real detail.", "they eat bamboo all day")],
  ("Add a reason and an example for each point, and finish with a sentence that invites replies.", "For example: \"The pandas were the best part because I had never seen one up close. Has anyone else been?\""),
  [("i think", "I think", "\"I\" is always a capital letter, and so is the first word of a sentence."), ("my favrite is the pandas they are cute", "My favourite is the pandas. They are cute", "Spell \"favourite\" correctly, and two ideas need a full stop between them."), ("the tickets was alot", "The tickets were a lot", "\"Tickets\" is plural so it takes \"were\", and \"a lot\" is two words."), ("was expensive to.", "was expensive too.", "\"Too\" means \"also\".")]),
 sample("a3", """Hi everyone,

My view is that a day at the zoo is well worth the money, as long as you plan it properly. I visited a wildlife park last summer with my family, and it turned out to be one of the best days we have had together.

The biggest reason is the chance to see animals you would never otherwise meet. Watching a giant panda chew bamboo for ten minutes, just a few metres away, was far more memorable then any documentary. The keeper talk added to this, because she answered every question patiently and told us facts that I had never heard before.

Of course the day is not perfect. Tickets cost £14 each, and we spent another £20 on lunch, which felt too much. The café also had a queue of nearly half an hour at midday.

However, these problems are easy to avoid: arrive early, bring a packed lunch and check the feeding times online. Done like that, a day at the zoo is great value.

Has anyone found other ways to save money?""",
  8, 5,
  "The view is clear and developed with convincing reasons, examples and a fair counter-point. Paragraphs are well organised, the tone suits a forum, and sentences are varied, including some complex ones. Vocabulary is well chosen.",
  "Punctuation is varied and mostly accurate, including a colon and commas for extra information. Spelling and grammar are very secure. There are only one or two small lapses.",
  [("You balanced your view by admitting a drawback, then showed how to solve it.", "However, these problems are easy to avoid"), ("You made your point vivid by comparing the experience with something familiar.", "far more memorable then any documentary")],
  ("To move from very good to excellent, add one precise detail, such as a name, a number or a short quotation, to your strongest reason.", "For example: \"The keeper told us that a panda can eat bamboo for up to twelve hours a day.\""),
  [("far more memorable then any documentary", "far more memorable than any documentary", "Use \"than\" when comparing."), ("Of course the day is not perfect.", "Of course, the day is not perfect.", "A comma usually follows an opening phrase such as \"Of course\".")]),
]))

# ---------- B: advice sheet, "Your first train journey" ----------
T.append(dict(id="mark-advice-train", title="An advice sheet for first-time train travellers", level="L1", missionId="w-transport-6", samples=[
 sample("b3", """Your First Train Journey: Tips for Travelling Alone

Travelling by train on your own for the first time can feel daunting, but a little preparation will make the day far more relaxing. These tips will help you to feel confident from the moment you leave home.

Before the journey

Start by checking the timetable on a journey-planner app, so that you know which train to catch and which platform it leaves from. Buy your ticket in advance if you can, because it is usually cheaper and you will not have to queue. Allow plenty of time to reach the station, and charge your phone the night before in case you need to show your ticket on screen.

On the day

When you arrive, look at the departure board to find your platform. Keep your ticket where you can reach it easily, since staff may ask to see it. Stand behind the yellow line, and let passengers get off before you step on. If you are unsure about anything, ask a member of staff: they are there to help.

Finally, remember that everyone was a beginner once. Follow these steps and you will be fine.""",
  8, 6,
  "A clear title, introduction and conclusion, with subheadings that match the two bullet points. Each tip says what to do and why, the tone is calm and helpful, and the sentences are varied, including complex ones.",
  "Punctuation is accurate and varied (commas, a colon, a hyphen), spelling is secure and grammar is consistently correct. There are no errors worth noting.",
  [("Each tip gives a reason, which makes the advice more convincing.", "because it is usually cheaper and you will not have to queue"), ("The ending is reassuring and fits the purpose of the sheet.", "everyone was a beginner once")],
  ("To add even more value, include one practical tip that a first-time traveller might not think of.", "For example: \"Sit near the door if you are nervous about missing your stop.\""),
  []),
 sample("b1", """Your first train journey

Before you go you should buy a ticket. You can get it on the app or at the station. Check the time of the train.

On the day get to the station early. Look at the screen to see what platform. Dont forget your ticket. Stand behind the yellow line. if you are not sure ask someone who works there
Have a good trip""",
  3, 2,
  "There are relevant tips for both parts of the task, but they are very brief with little explanation of why, and there is no introduction. The sentences are short and the layout is very basic.",
  "Some full stops and capital letters are correct, but several are missing, and there is a missing apostrophe and a sentence with no end punctuation. The meaning is still clear.",
  [("Your tips are practical and in a sensible order.", "Stand behind the yellow line"), ("You split the advice into before and on the day, which matches the task.", "On the day get to the station early")],
  ("Say why each tip helps and add a short opening sentence, so that the reader knows who the advice is for.", "For example: \"Buy your ticket before you travel, so that you do not have to queue.\""),
  [("Dont forget your ticket.", "Don't forget your ticket.", "A short form needs an apostrophe."), ("if you are not sure ask someone who works there", "If you are not sure, ask someone who works there.", "Start with a capital, add a comma after the opening clause and finish with a full stop."), ("On the day get to the station early.", "On the day, get to the station early.", "A comma follows an opening phrase."), ("Have a good trip", "Have a good trip.", "Every sentence needs end punctuation.")]),
 sample("b2", """Your First Train Journey: Tips for Travelling Alone

Travelling by train on your own for the first time can feel scary, but a little planning makes it much easier.

Before the journey

First, check the timetable on an app so you know which train to catch and what platform it leaves from. Buy your ticket in advance if you can, because it is usually cheaper and you wont have to queue. Leave plenty of time to get to the station, and charge your phone so you can show your ticket on the screen.

On the day

When you arrive look at the departure board to find your platform. Keep your ticket handy as staff may ask to see it. Stand behind the yellow line, and let people get off before you get on. If your not sure about anything, ask a member of staff, they are there to help.

Remember, everyone was a beginner once, so try not to worry.""",
  6, 3,
  "A clear title, introduction and subheadings. Tips are organised well and most include a reason. The tone is helpful. Language is clear but fairly plain, with some repeated sentence patterns.",
  "Spelling and full stops are mostly accurate, but there are several slips with apostrophes, commas and one comma used where a full stop is needed. This is reasonably accurate with some lapses.",
  [("Your sheet is well organised, with a title and clear subheadings.", "Before the journey"), ("You explained why buying in advance helps.", "because it is usually cheaper and you wont have to queue")],
  ("Add a sentence at the end of each section that sums up the main tip, and vary your sentence openings.", "For example: \"With these steps done, you can enjoy the journey.\""),
  [("you wont have to queue", "you won't have to queue", "A short form needs an apostrophe."), ("If your not sure", "If you're not sure", "\"You're\" means \"you are\"."), ("When you arrive look at", "When you arrive, look at", "A comma follows an opening clause."), ("ask a member of staff, they are there to help.", "ask a member of staff. They are there to help.", "A comma cannot join two complete sentences.")]),
]))

# ---------- C: blog, "My first week somewhere new" ----------
T.append(dict(id="mark-blog-move", title="A blog post about moving to a new area", level="L1", missionId="w-geography-6", samples=[
 sample("c1", """my first week in the town

I moved from a village to a town last week. It is very diferent here. There is lots of shops and the bus come every ten minutes. In the village we only had one bus a day.

I like the shops but it is noisey and I miss my freinds. i miss the feilds and its quiet.

I will tell you more next week""",
  3, 2,
  "There are relevant points about differences, likes and misses, but very little detail or explanation. There is no real opening or closing, and the sentences are short and simple.",
  "Several spelling mistakes, missing capital letters, a missing apostrophe and some grammar slips, but the writing can still be understood.",
  [("You compared the village and the town with a clear fact.", "In the village we only had one bus a day"), ("You said how you feel about the move.", "I miss my freinds")],
  ("Give an example for each difference and say how it makes you feel.", "For example: \"The buses are so frequent that I never worry about missing one.\""),
  [("diferent", "different", "A spelling slip."), ("There is lots of shops and the bus come every ten minutes.", "There are lots of shops and the bus comes every ten minutes.", "\"Shops\" is plural so it takes \"are\", and \"the bus\" takes \"comes\"."), ("noisey", "noisy", "A spelling slip."), ("i miss the feilds and its quiet.", "I miss the fields and the quiet.", "\"I\" needs a capital, \"fields\" is spelt with ie, and \"its quiet\" should be \"the quiet\".")]),
 sample("c2", """My first week somewhere new

Last Saturday I moved from a small village to a big town, and everything feels different.

The first thing I noticed was the noise. In the village I could hear birds in the morning, but here its cars and buses all day and night. There are also lots more people, and nobody says hello to each other like they did at home. On the plus side there are shops and cafes everywhere and a bus every ten minutes, which means I can see my new friends easily.

What I like most is that I dont need a lift from my parents any more. I can just catch the bus into town after college. What I miss, though, is the fields behind our house and walking the dog in the quiet evenings.

I'll write again next week and tell you how I'm getting on. Has anyone else moved recently?""",
  5, 3,
  "Relevant and organised, with a title, opening, paragraphs and closing question. Differences and feelings are both covered with some detail. Sentences are mostly simple, with some variety.",
  "Full stops and most spelling are accurate, but there are repeated slips with apostrophes and several missing commas. A grammar slip makes one sentence awkward.",
  [("You noticed a detail that makes the move feel real.", "In the village I could hear birds in the morning"), ("You used a closing question to involve your readers.", "Has anyone else moved recently?")],
  ("Develop one point further with an example or a feeling, and join some short sentences with words like \"because\" or \"although\".", "For example: \"Although the noise bothers me, the bus is so convenient that I can see my friends every day.\""),
  [("here its cars and buses", "here it's cars and buses", "\"It's\" means \"it is\"."), ("I dont need a lift", "I don't need a lift", "A short form needs an apostrophe."), ("On the plus side there are shops", "On the plus side, there are shops", "A comma follows an opening phrase.")]),
 sample("c3", """My first week somewhere new

Last Saturday I moved from a small village to a big town, and almost everything feels different.

The first thing I noticed was the noise. In the village I woke to birdsong, but here it is traffic from morning until midnight. There are also far more people, and while the streets are busier, they feel less friendly than the lanes at home. On the plus side, there are shops, cafés and a bus every ten minutes, which means I can see my new friends whenever I like.

What I enjoy most is my independence. I no longer need a lift from my parents, because I can catch the bus into town after college. What I miss, though, are the fields behind our house and the quiet evenings walking the dog. There is also less people to say hello to, which I find strange.

I will write again next week to tell you how I am getting on. Has anyone else made a move like this?""",
  8, 5,
  "Well organised and well written, with a clear opening, developed paragraphs and a friendly ending. Differences, likes and misses are all covered with convincing detail, and the vocabulary and sentence structures are varied.",
  "Punctuation is accurate and varied, and spelling is secure. There is one grammar slip and one awkward agreement, so it sits in the top band with occasional lapses.",
  [("You used a comparison that makes the contrast between village and town clear.", "I woke to birdsong, but here it is traffic from morning until midnight"), ("Your tone is friendly and honest, which suits a blog.", "which I find strange")],
  ("To lift the writing further, replace one general word with a precise one and add a short example from your day.", "For example: \"On Tuesday I counted four buses in ten minutes.\""),
  [("There is also less people", "There are also fewer people", "Use \"fewer\" for things you can count, and match the verb to the plural.")]),
]))

# ---------- D: online form, "Feedback on a food tour" ----------
T.append(dict(id="mark-form-tour", title="Feedback on a food tour", level="L1", missionId="w-israel-4", samples=[
 sample("d2", """The part I enjoyed most was the tasting stops. We tried falafel, hummus and sweet pastries, and the guide explained what was in each dish, which made it more interesting. I also liked that the stallholders were friendly and let us taste before we bought anything.

It could be improved by making the groups smaller. There were twenty five people in our group so it was hard to hear the guide, and we only stopped for water once even though it was very hot. A water break every hour would help.

I would recommend the tour to anyone who loves food, but I would suggest booking the morning one to avoid the crowds. Thank you for asking for my views.""",
  6, 4,
  "Both parts of the task are covered with clear reasons and examples. It is organised in paragraphs, polite and suits an online form. Language is clear with some range, though sentences are quite similar in length.",
  "Mostly accurate punctuation and spelling, with a few missing commas and a missing hyphen. Grammar is secure.",
  [("You gave a reason for what you enjoyed, not just an opinion.", "the guide explained what was in each dish, which made it more interesting"), ("You suggested a practical improvement.", "A water break every hour would help")],
  ("Add one specific detail to your recommendation, such as who it would suit best.", "For example: \"It would suit families, because the guide was patient with children.\""),
  [("There were twenty five people in our group so it was hard", "There were twenty-five people in our group, so it was hard", "Hyphenate numbers like twenty-five and put a comma before \"so\" when it joins two ideas.")]),
 sample("d1", """The tour was good. i liked the food. We tryed falafel and hummus it was nice. the guide was friendly.

It was to hot and there was too many people. I would recomend it""",
  3, 2,
  "Both parts of the task are touched on, but each point is very short with no real reasons or examples. There is no closing thank-you and the sentences are simple.",
  "Several capital letters and full stops are missing, and there are spelling slips and a grammar slip, but the meaning is clear.",
  [("You mentioned something you liked and something you did not like.", "the guide was friendly"), ("You finished with a clear recommendation.", "I would recomend it")],
  ("Give a reason for each opinion, using the word \"because\".", "For example: \"The guide was friendly because he explained every dish and answered our questions.\""),
  [("i liked the food", "I liked the food", "Start each sentence with a capital letter."), ("We tryed falafel and hummus it was nice.", "We tried falafel and hummus. It was nice.", "Check the spelling of \"tried\", and two ideas need a full stop between them."), ("It was to hot and there was too many people.", "It was too hot and there were too many people.", "\"Too\" means \"more than is wanted\", and \"people\" takes \"were\"."), ("I would recomend it", "I would recommend it.", "A spelling slip, and the sentence needs a full stop.")]),
 sample("d3", """What I enjoyed most was the tasting stops. We sampled warm falafel, creamy hummus and sticky pastries, and our guide explained the story behind every dish, which turned a simple snack into a lesson in local culture. The stallholders were also generous, letting us taste before we bought.

The tour could be improved by limiting the group size. With twenty-five people, it was difficult to hear the guide over the noise of the market, and since temperatures were high we would have welcomed more than one water break.

Overall, I would happily recommend the tour, particularly to families and anyone who enjoys trying new food. I would suggest booking the morning session, when the crowds are smaller. Thank you for the opportunity to share my views.""",
  8, 6,
  "Both parts are covered in full, with specific, convincing detail and a polite, formal tone that suits an online form. Paragraphs are well organised, sentences are varied, and the vocabulary is well chosen.",
  "Punctuation is accurate and varied, spelling is secure and grammar is consistently correct.",
  [("Your detail makes the writing vivid and specific.", "warm falafel, creamy hummus and sticky pastries"), ("You gave a clear reason for suggesting the morning session.", "when the crowds are smaller")],
  ("Add one sentence that explains how your suggestion would improve the experience for other people.", "For example: \"Smaller groups would let everyone ask the guide questions.\""),
  []),
]))
