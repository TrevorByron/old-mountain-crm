-- The small label above a headline, part of the brand's kicker-then-headline pattern.
alter table broadcasts add column kicker text;

update templates set name = 'Newsletter' where layout_key = 'letter';
