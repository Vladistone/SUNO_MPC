import easymidi from 'easymidi';

console.log('Слушаем MIDI...');
const input = new easymidi.Input('ipMIDI Port 5');

input.on('cc', (msg) => {
    console.log('CC:', msg.controller, '=', msg.value);
});

input.on('noteon', (msg) => {
    console.log('Note On:', msg.note);
});