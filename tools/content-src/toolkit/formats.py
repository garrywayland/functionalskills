# (prompt, correct, [three wrong options], why) for each writing format.
# The first question of each skill is the existing practice question, added by the build script.
Q = {}
Q['email'] = [
 ("What should the subject line of an email do?", "Say in a few words what the email is about", ["Repeat the whole email", "Give your home address", "Stay blank so the reader opens it"], "A good subject line tells the reader at a glance why you are writing, for example \"Volunteer application for Panda Week\"."),
 ("Which sentence is best for explaining why you are writing?", "I am writing to apply for the weekend job advertised on your website.", ["So, yeah, I saw something.", "Writing to you now.", "This email is an email about a job."], "It says clearly who you are writing about and why, in a polite, formal way."),
 ("Which closing and sign-off suits an email to someone you have never met?", "Kind regards, followed by your name", ["See ya!", "Love from", "Cheers mate"], "\"Kind regards\" is polite without being stiff. The others are too casual or too personal for a stranger."),
 ("Which request is the politest?", "Could you please let me know the cost of a group ticket?", ["Tell me the price.", "Price?", "You need to tell me how much it is."], "\"Could you please\" is polite and clear. The others sound abrupt or bossy."),
 ("What should each paragraph of an email usually do?", "Cover one main point", ["Cover every point in one big block", "Be a single short sentence", "Start with the sign-off"], "One main point per paragraph makes an email easy to follow."),
 ("What should you do before you press send?", "Read it through and check spelling and punctuation", ["Add lots of emojis", "Delete the greeting to save time", "Write it all in capital letters"], "Proof-reading catches mistakes and makes a better impression."),
 ("Which sentence is the best way to ask for a reply?", "I would be grateful for a reply by Friday 12 June.", ["Reply when you feel like it.", "Reply or else.", "That is all, bye."], "It is polite and gives a clear date."),
 ("Which greeting suits a friendly email to a friend?", "Hi Maya,", ["Dear Sir or Madam,", "To whom it may concern,", "Dear Customer Service Manager,"], "A friend can be greeted by first name. The other greetings are formal."),
 ("Which is the best order for an email of application?", "Greeting, reason for writing, details, polite close, sign-off", ["Sign-off, details, greeting, reason for writing", "Details, greeting, sign-off, reason for writing", "Reason for writing, sign-off, greeting, details"], "A reader expects to be greeted first, told why you are writing, given the details, and then thanked."),
]
Q['letter'] = [
 ("You know the person's name and start with \"Dear Ms Khan\". How should you sign off?", "Yours sincerely", ["Yours faithfully", "Love from", "Cheers"], "When you use a name, you sign off with \"Yours sincerely\". \"Yours faithfully\" goes with \"Dear Sir or Madam\"."),
 ("Where does your own address go in a formal letter?", "In the top right-hand corner", ["At the bottom of the page", "After the sign-off", "In the greeting"], "The sender's address goes at the top right, with the date underneath."),
 ("Where does the date go?", "Under your address", ["On the last line", "Next to your signature", "In the first paragraph"], "The date goes under the sender's address near the top."),
 ("Which first sentence suits a letter of complaint?", "I am writing to complain about the coach trip that was cancelled on 14 May.", ["Your company is terrible.", "Hello, it's me again.", "I was really annoyed!!!"], "It states the purpose clearly and politely, with a date."),
 ("Which sentence keeps a complaint polite but firm?", "I would be grateful if you could refund my fare in full.", ["Give me my money back now.", "I demand a refund immediately, or else.", "You had better sort this out."], "It makes a clear request without being rude."),
 ("What should the last paragraph of a formal letter usually do?", "Say what you want to happen and thank the reader", ["Repeat your address", "Add a brand new complaint", "Apologise for writing"], "Ending with a clear request and a thank-you leaves the reader knowing what to do next."),
 ("Which greeting is correct if you do not know the person's name?", "Dear Sir or Madam,", ["Hi there,", "Dear you,", "To the boss,"], "\"Dear Sir or Madam\" is the standard formal greeting when you do not have a name."),
 ("Which phrase is too informal for a formal letter?", "I was totally gutted about it.", ["I was extremely disappointed.", "I would like to explain what happened.", "Thank you for your time."], "\"Totally gutted\" is slang. A formal letter uses a more measured phrase such as \"extremely disappointed\"."),
 ("Which sentence uses a formal register?", "I should be grateful for a reply within fourteen days.", ["Write back soon, yeah?", "Get back to me quick.", "Just reply whenever."], "It is polite, precise and fully formal."),
]
Q['article'] = [
 ("What is the job of the opening paragraph of an article?", "Hook the reader and show what the article is about", ["Give the writer's address", "List every fact in the article", "Finish the argument"], "A good opening grabs attention and tells readers what to expect."),
 ("Which opening is best for an article about healthy eating?", "Have you ever wondered why a packed lunch can beat a canteen meal?", ["Food.", "This article is about food.", "I will now write about food and stuff."], "A question speaks to the reader and makes them want to read on."),
 ("Why do articles often use subheadings?", "They break up the text and help readers find sections", ["They replace paragraphs", "They must always be full sentences", "They show the writer's name"], "Subheadings make an article easier to scan and follow."),
 ("Which ending suits a persuasive article?", "So next Monday, leave the car at home and give the bus a try.", ["That's it.", "I have run out of things to say.", "Thank you for reading my homework."], "A call to action leaves the reader with something to do."),
 ("Which sentence uses direct address?", "You may be surprised how much money you could save.", ["People may be surprised how much money could be saved.", "Money can be saved by some.", "Savings were found."], "Direct address speaks straight to the reader with \"you\"."),
 ("Which of these is a rhetorical question?", "Who wants to sit in traffic for an hour every morning?", ["What time does the bus leave?", "Where is the nearest station?", "How much is a day ticket?"], "A rhetorical question is asked for effect, and the writer expects the answer to be \"nobody\"."),
 ("Which tone suits an article for students?", "Lively and friendly, in full sentences", ["Slang and text-speak", "Very formal legal language", "Rude and sarcastic"], "A lively, friendly tone keeps readers interested, while full sentences keep it correct."),
 ("What is the best way to support a point in an article?", "Give a reason and an example or fact", ["Repeat the point more loudly", "Add three exclamation marks", "Say that everyone knows it"], "Reasons and evidence make a point convincing."),
 ("Which set of features belongs in an article for a college newsletter?", "A headline, paragraphs and a clear ending", ["A postal address and the date", "A subject line and \"Dear...\"", "A sign-off of \"Yours faithfully\""], "A headline, paragraphs and an ending are the basic features of an article."),
]
Q['review'] = [
 ("What should the first paragraph of a review do?", "Say what you are reviewing and give a first impression", ["List every price", "Say goodbye to the reader", "Repeat the leaflet"], "Readers need to know what is being reviewed and what you thought, straight away."),
 ("Which comment is balanced?", "The café was friendly, although the prices were high.", ["The café was perfect in every way.", "The café was awful.", "The café was a café."], "It gives a good point and a not-so-good point."),
 ("What should a good recommendation include?", "Who it would suit and why", ["The writer's address", "A question for the reader's teacher", "An apology"], "Telling readers who would enjoy it helps them decide."),
 ("Which sentence gives a reason?", "I enjoyed it because the guide made every dish easy to understand.", ["I enjoyed it.", "It was fun.", "Good."], "\"Because\" shows the reason behind the opinion."),
 ("Which comment is the most helpful to someone deciding whether to go?", "Tickets cost £12, but the queue at lunchtime lasted forty minutes.", ["It was fine.", "Loved it!!", "Not great."], "It gives specific facts a reader can act on."),
 ("Which critical comment is fair and helpful?", "The seats were uncomfortable, so I would bring a cushion.", ["The seats were rubbish.", "The seats existed.", "I hated the seats."], "It gives the problem and a useful tip."),
 ("Which tone is best for a review?", "Honest and friendly, with reasons", ["Angry and rude", "Bored and brief", "Copied from the leaflet"], "Readers trust honest opinions that come with reasons."),
 ("Which is the best final sentence for a review?", "Overall, I would recommend it for families, but go early to avoid queues.", ["The end.", "Bye.", "I rest my case."], "It sums up the view, says who it suits and gives a tip."),
 ("Which group of words shows the writer's opinion?", "Delicious, disappointing, brilliant", ["Tuesday, bus, seventeen", "And, but, so", "Ticket, shelf, door"], "Opinion words describe how good or bad something was."),
]
Q['report'] = [
 ("What does the introduction of a report do?", "Explains the purpose of the report", ["Gives the final recommendations", "Tells a joke", "Repeats the title"], "A report starts by saying why it was written."),
 ("Which sentence is suited to a formal report?", "It was found that most students travel to college by bus.", ["Loads of students go by bus lol.", "Basically everyone is on the bus.", "Guess what, buses rule."], "A report uses a formal, factual tone."),
 ("Where do recommendations usually go in a report?", "In a final section, often as numbered points", ["Before the title", "In the middle of the introduction", "Nowhere, reports never have them"], "Recommendations come last, after the findings."),
 ("Which is a clear recommendation?", "The council should install a covered cycle store by the main entrance.", ["Bikes are bad.", "Maybe stuff could happen.", "I think it's whatever."], "It says who should do what, and where."),
 ("The survey found that 18 out of 40 students use the bus. Which sentence reports this best?", "Nearly half of the students (18 out of 40) travel by bus.", ["Bus 18.", "18 students, bus, 40.", "Bus is 18 of 40 so yeah."], "A good report turns figures into a clear sentence."),
 ("Which should be avoided in a formal report?", "Slang and personal chat", ["Subheadings", "Facts and figures", "Clear paragraphs"], "Slang and chat do not suit a formal report."),
 ("Which opening line suits a report for a head teacher?", "This report describes how Panda Day went and suggests improvements for next year.", ["Hiya, here's what I think.", "Dear Diary,", "Read this now."], "It states the purpose formally and clearly."),
 ("Which heading fits a section about what went wrong?", "Problems", ["Yay!", "Stuff", "My feelings about lunch"], "Headings should be short, plain and informative."),
 ("What are the \"To\", \"From\" and \"Date\" lines at the top of a report for?", "To show who it is for, who wrote it and when", ["To make the page look full", "To show the price", "To list the page numbers"], "They tell the reader the basic facts about the report."),
]
Q['blog'] = [
 ("Which title would catch a reader's attention?", "I Moved from a Village to a Town: Here's What Surprised Me", ["Blog", "A text about moving", "Thoughts"], "A good title is specific and makes you want to read on."),
 ("Why does a blog post use short paragraphs?", "They are easier to read on a screen", ["They use less ink", "They are required by law", "They hide spelling mistakes"], "Short paragraphs stop the page looking like a solid block of text."),
 ("Which opening is personal and clear?", "Last month I swapped fields for pavements, and I have a lot to say about it.", ["Moving is a thing that people do.", "In this blog post the following will be explained.", "Dear Sir or Madam,"], "It sounds like a real person and tells you what is coming."),
 ("Which tone is right for a blog?", "Friendly and honest, in full sentences", ["Slang and emojis only", "Cold and legal", "Shouting in capital letters"], "A blog can be personal, but it should still be clear and correct."),
 ("Which sentence gives a reason for a view?", "I prefer the town because I can reach my friends on foot.", ["I prefer the town.", "Town is good.", "It is town."], "\"Because\" introduces a reason."),
 ("Which closing invites readers to join in?", "What do you think? Tell me in the comments.", ["Do not reply.", "Bye forever.", "That is my last word and nobody can change it."], "Ending with a question encourages readers to respond."),
 ("Which is a good way to add interest to a blog post?", "A short story about something that happened to you", ["A list of random words", "A copy of a leaflet", "Your first sentence repeated"], "Personal stories bring a blog to life."),
 ("Which should you avoid in a blog post?", "Text-speak such as \"cuz\" and \"ur\"", ["Full stops", "Paragraphs", "A title"], "Text-speak looks careless, even in a friendly post."),
 ("Which ending is balanced and honest?", "I miss the quiet, but I would not go back.", ["Everything is perfect.", "Everything is terrible.", "I have nothing to say."], "It admits something good about the old place while being clear about the choice."),
]
Q['forum'] = [
 ("Where in a forum post should your view appear?", "In the first sentence or two", ["In the very last line only", "Nowhere, keep it secret", "In the sign-off"], "Readers should know your view straight away."),
 ("Which reply to a question is the most helpful?", "I'd say yes, because the guided tour answers questions you would otherwise miss.", ["No.", "Whatever.", "Why are you asking?"], "It gives a view and a reason."),
 ("How can you disagree politely?", "I see your point, but I think evening buses matter more.", ["You are wrong and silly.", "That is the dumbest idea.", "Nobody agrees with you."], "It acknowledges the other view before giving yours."),
 ("A good forum post usually ends with...", "A question or an invitation to reply", ["Your full address", "Yours faithfully", "A long list of rules"], "Inviting a reply keeps the discussion going."),
 ("Which tone suits a web forum?", "Friendly and chatty, but still clear", ["Cold and legal", "Rude and angry", "Silent"], "A forum is informal, but readers still need to understand you."),
 ("Which sentence includes an example?", "For example, last winter my bus was cancelled three times in a week.", ["Buses are sometimes late.", "I do not like buses.", "Buses exist."], "A specific example makes a point real."),
 ("Why are short paragraphs useful in a forum post?", "They are easier to read on a screen", ["They are quicker to type backwards", "They are required by the website", "They hide spelling mistakes"], "Short paragraphs keep a post readable."),
 ("Which is NOT suitable in a forum post?", "ALL CAPITALS to show anger", ["A polite greeting", "A reason for your view", "A question at the end"], "Capital letters look like shouting and make a post harder to read."),
 ("Which opening shows you are replying to another member?", "Hi Dani, I agree with your point about late buses.", ["Dear Sir,", "To whom it may concern,", "Yours sincerely,"], "It names the person and links to what they said."),
]
Q['form'] = [
 ("What should you do first when you reach a box on an online form?", "Read the label on the box", ["Start typing at once", "Skip to the next box", "Delete the label"], "The label tells you what to write."),
 ("Which answer is best for the box \"What could be improved?\"", "The group was large, so a smaller group would make it easier to hear the guide.", ["Nothing.", "Everything.", "idk"], "It gives a clear point, a reason and a suggestion."),
 ("Why should you write in full sentences on a form?", "They make your meaning clear to the reader", ["They use up more space", "They are required by law", "They hide mistakes"], "A reader who is not in front of you needs clear sentences."),
 ("Which is a polite way to complain on a form?", "I was disappointed that the tour started late, and I would appreciate a smaller group next time.", ["Your tour was a joke.", "Terrible. Do better.", "Sort it out."], "It is honest, polite and constructive."),
 ("A box asks \"Would you recommend this?\" Which answer is best?", "Yes, I would, especially for families, because the guide was friendly and the food was excellent.", ["Yes.", "yeah why not", "Maybe if I feel like it."], "It gives an answer, a reason and who it suits."),
 ("What should you do before pressing submit?", "Check your spelling and punctuation", ["Add more boxes", "Write in capitals", "Delete your answer"], "Proof-reading avoids mistakes."),
 ("The box is small and you have a lot to say. What should you do?", "Choose the most important points and write them clearly", ["Write very tiny so everything fits", "Leave it blank", "Copy the label"], "Clear, short answers are better than cramming."),
 ("Which line suits the end of a feedback form?", "Thank you for asking for my views.", ["Done.", "Bye.", "Whatever you say."], "A polite thank-you is a good finish."),
 ("Which sentence gives a reason for a view?", "I enjoyed the tasting stops because I tried foods I had never eaten before.", ["I enjoyed it.", "It was good.", "Nice."], "\"Because\" shows the reason."),
]
Q['advice'] = [
 ("Which title shows who an advice sheet is for?", "Your First Train Journey: Tips for Travelling Alone", ["Train", "Things to know", "Advice"], "A good title says who the advice is for and what it covers."),
 ("Which tip explains what to do and why?", "Charge your phone the night before, so you can show your ticket on the screen.", ["Charge your phone.", "Phones are useful.", "Phone."], "A tip with a reason is more helpful and more convincing."),
 ("Which sentence uses direct, simple language?", "Arrive ten minutes early so that you can find the right platform.", ["It might be advisable that early arrival be considered in the context of platform location.", "Maybe get there at some time.", "Arriving early is a thing."], "Advice should be clear and direct."),
 ("When are numbered tips the best choice?", "When the order of the steps matters", ["When you want to hide the order", "When there is only one tip", "When the tips are jokes"], "Numbers show a sequence."),
 ("Which is a good opening line for an advice sheet?", "If you are walking in the desert for the first time, these tips will keep you safe and comfortable.", ["I am a person who walks.", "Walking.", "This is a document."], "It says who the advice is for and why it helps."),
 ("Which closing line reassures the reader?", "Follow these steps and you will be fine, and staff are always happy to help.", ["Good luck, you will need it.", "That is all.", "Do not blame us."], "A reassuring ending leaves the reader feeling confident."),
 ("Which sentence is written as an instruction?", "Check the timetable before you leave.", ["The timetable could have been checked.", "Checking is something people do.", "You will have checked."], "Instructions use the base form of the verb and speak to the reader."),
 ("Which heading is the clearest?", "What to bring", ["Stuff", "Bag things?", "Misc"], "A clear heading tells the reader what is in the section."),
 ("Which sentence is too vague to be good advice?", "Be careful and do things properly.", ["Carry at least two litres of water.", "Wear a hat and sun cream.", "Keep with the group."], "Good advice is specific, so the reader knows exactly what to do."),
]
Q['diary'] = [
 ("How should a diary entry usually start?", "With the day and the date", ["With \"Yours faithfully\"", "With a subject line", "With a list of prices"], "The date shows when the events happened."),
 ("Which sentence shows feelings?", "I was nervous when the keeper opened the gate, but I soon relaxed.", ["The gate opened.", "The keeper opened the gate at nine.", "There was a gate."], "A diary says how the writer felt, not only what happened."),
 ("Which sentence keeps events in the order they happened?", "First we fed the animals, then we cleaned the garden, and after lunch we watched a talk.", ["After lunch we watched a talk, first we fed the animals, then we cleaned the garden.", "We cleaned, talk, fed, lunch.", "The garden talk fed lunch."], "A diary usually follows time order."),
 ("Which person is a diary written in?", "First person (I)", ["Second person (you)", "Third person (he or she)", "Passive only"], "A diary is a personal record, so it uses \"I\"."),
 ("Which is a good descriptive detail?", "The bamboo smelled like fresh-cut grass.", ["It smelled.", "There was bamboo.", "Bamboo exists."], "Specific detail makes writing vivid."),
 ("Which ending looks ahead?", "Tomorrow I am helping the keepers with the afternoon feed, and I can't wait.", ["That was Tuesday.", "The end.", "I wrote this."], "Looking ahead is a natural way to finish a diary."),
 ("Which tone suits a diary entry?", "Personal and chatty, in full sentences", ["Formal and legal", "Rude to the reader", "A list of numbers"], "A diary sounds like the writer, but should still be written in correct sentences."),
 ("Which of these does NOT belong in a diary entry?", "Yours faithfully", ["Today I felt...", "I can't wait for tomorrow", "I was surprised by..."], "\"Yours faithfully\" is the ending of a formal letter."),
 ("Which sentence uses the past tense correctly?", "We arrived at eight and the keepers were already working.", ["We arrive at eight and the keepers was already working.", "We arrives at eight and the keepers were already working.", "We arriving at eight and the keepers is already working."], "A diary about today usually uses the past tense, with correct verbs."),
]
Q['newsletter'] = [
 ("What goes at the top of a newsletter?", "The name of the newsletter and the date", ["A sign-off", "The price list", "The writer's address"], "Readers want to know what it is and when it is from."),
 ("Which welcome works best?", "Welcome to this month's newsletter. Read on for news about the summer fair and our new bus service.", ["Hello.", "Newsletter.", "Read."], "It welcomes readers and tells them what is inside."),
 ("Why use a heading for each item?", "Readers can scan and find what interests them", ["It makes the newsletter longer", "It hides the text", "It is required by law"], "Headings make a newsletter easy to scan."),
 ("Which tone suits a newsletter?", "Friendly and positive, speaking to \"you\" and \"we\"", ["Cold and formal", "Rude and sarcastic", "Silent"], "A newsletter builds a sense of community."),
 ("Which closing line works well?", "Come along on 12 July and bring a friend.", ["That is all.", "Do not come.", "Bye."], "It gives a date and invites people to join in."),
 ("Which is best for event details?", "The date, time and place in a short list", ["Hidden in a long paragraph", "Left out", "Written as a riddle"], "Event details should be easy to find."),
 ("Which heading is best for news of a bus timetable change?", "New Evening Bus from 1 September", ["Bus", "News", "A thing about buses"], "It is specific and tells the reader what and when."),
 ("Which sentence invites people to get involved?", "If you would like to help at the fair, please speak to Maya at the village hall.", ["Do not help.", "The fair is held.", "Fairs exist."], "It says what to do and who to ask."),
 ("Which does NOT belong in a newsletter item?", "Rude comments about neighbours", ["Dates of events", "A thank-you", "Contact details"], "A newsletter should be friendly and respectful."),
]
