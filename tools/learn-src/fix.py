F = []
def fx(id,title,skill,intro,items,level=None):
    F.append(dict(id=id,title=title,skill=skill,intro=intro,level=level or "both",items=[dict(wrong=t[0],fixed=t[1],why=t[2],**({'also':t[3]} if len(t)>3 else {})) for t in items]))

fx("fix-apostrophes","Fix the apostrophes","Apostrophes","Each sentence has an apostrophe missing or in the wrong place. Rewrite it correctly, then check.",[
 ("Im going to the library after college.","I'm going to the library after college.","I'm is short for I am. The apostrophe shows the missing letter."),
 ("We couldnt find the platform.","We couldn't find the platform.","Couldn't is short for could not."),
 ("The dogs lead was too short.","The dog's lead was too short.","One dog owns the lead, so the apostrophe goes before the s."),
 ("The teachers meeting starts at four.","The teachers' meeting starts at four.","Several teachers own the meeting, so the apostrophe goes after the s."),
 ("Its a lovely day and the sun has got its hat on.","It's a lovely day and the sun has got its hat on.","It's means it is. Its (no apostrophe) shows belonging. Only the first one needed fixing."),
 ("Three bus's were late this morning.","Three buses were late this morning.","A plural does not take an apostrophe."),
 ("The childrens playground is closed.","The children's playground is closed.","Children is already plural, so add 's."),
 ("Theyre not sure whose coming.","They're not sure who's coming.","They're is they are, and who's is who is. Whose shows belonging."),
])
fx("fix-capitals","Fix the capital letters and full stops","Capitals and full stops","Each text has capital letters or full stops missing. Rewrite it correctly, then check.",[
 ("on monday i went to london with my sister.","On Monday I went to London with my sister.","Days, places and the word I all start with a capital letter, and so does the first word."),
 ("We waited for the train it was late.","We waited for the train. It was late.","Two separate ideas need a full stop between them.", ["We waited for the train; it was late.", "We waited for the train, and it was late."]),
 ("my favourite subject is english, and my teacher is mrs patel.","My favourite subject is English, and my teacher is Mrs Patel.","Names of subjects such as English, titles and names need capital letters."),
 ("The cafe was busy. so we sat outside.","The cafe was busy, so we sat outside.","A sentence should not start with so after a full stop. A comma joins the two parts."),
 ("Are you coming to the match on saturday","Are you coming to the match on Saturday?","A question ends with a question mark, and days start with a capital letter."),
 ("What a brilliant goal","What a brilliant goal!","An exclamation takes an exclamation mark."),
 ("In december we visited the Dead Sea in israel.","In December we visited the Dead Sea in Israel.","Months and countries start with a capital letter."),
 ("The panda eats bamboo. it can eat for twelve hours a day.","The panda eats bamboo. It can eat for twelve hours a day.","The first word after a full stop needs a capital letter."),
])
fx("fix-commas","Fix the commas","Commas","Each sentence needs commas or has one in the wrong place. Rewrite it correctly, then check.",[
 ("We bought bread milk eggs and cheese.","We bought bread, milk, eggs and cheese.","Commas separate items in a list."),
 ("However the train was late.","However, the train was late.","A comma follows an opening word such as however."),
 ("When we arrived at the station we bought our tickets.","When we arrived at the station, we bought our tickets.","A comma follows an opening clause."),
 ("My brother who lives in Leeds is a nurse.","My brother, who lives in Leeds, is a nurse.","Commas go round extra information."),
 ("I wanted to go but it was raining so I stayed in.","I wanted to go, but it was raining, so I stayed in.","A comma goes before but and so when they join two full ideas.", ["I wanted to go, but it was raining so I stayed in."]),
 ("The tour was long, the guide was excellent.","The tour was long. The guide was excellent.","A comma cannot join two complete sentences. Use a full stop (or a joining word).", ["The tour was long, and the guide was excellent.", "The tour was long; the guide was excellent."]),
 ("I am writing to ask about the trip, thank you.","I am writing to ask about the trip. Thank you.","A comma cannot join two separate sentences. Use a full stop."),
 ("If you are unsure ask a member of staff.","If you are unsure, ask a member of staff.","A comma follows an opening if clause."),
])
fx("fix-spelling","Fix the spelling","Spelling","Each sentence has one spelling mistake, often a word that sounds the same as the right one. Rewrite it correctly, then check.",[
 ("There going to be late.","They're going to be late.","They're means they are. There points to a place."),
 ("I would like to here your opinion.","I would like to hear your opinion.","Hear is what you do with your ears. Here is a place."),
 ("It was to cold to go outside.","It was too cold to go outside.","Too means more than needed or also."),
 ("We went to the park for our brake.","We went to the park for our break.","A break is a rest. A brake stops a bike."),
 ("The weather was nice, accept for the wind.","The weather was nice, except for the wind.","Except means apart from. Accept means to take."),
 ("I recieved your letter yesterday.","I received your letter yesterday.","I before E, except after C."),
 ("The new libary opens on Monday.","The new library opens on Monday.","Say it slowly: lie-brar-y."),
 ("This is definately the best answer.","This is definitely the best answer.","Definitely has the word finite in the middle."),
])
fx("fix-grammar","Fix the grammar","Grammar","Each sentence has a grammar mistake with agreement or tense. Rewrite it correctly, then check.",[
 ("There is three buses to the town.","There are three buses to the town.","Three buses is plural, so use are."),
 ("Each of the students have a ticket.","Each of the students has a ticket.","Each is singular, so it goes with has."),
 ("Yesterday we go to the museum.","Yesterday we went to the museum.","Yesterday means the past, so use the past tense."),
 ("She don't like crowds.","She doesn't like crowds.","She goes with doesn't."),
 ("I seen the film last week.","I saw the film last week.","Saw is the past tense. Seen needs have."),
 ("We was waiting for an hour.","We were waiting for an hour.","We goes with were."),
 ("Me and my friend went to the match.","My friend and I went to the match.","Use I when you are doing the action, and put yourself last."),
 ("It was more better than I expected.","It was better than I expected.","Better already means more good, so do not add more.", ["It was much better than I expected."]),
])
