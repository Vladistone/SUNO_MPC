import easymidi from 'easymidi';

console.log('Доступные MIDI входы:');
console.log(easymidi.getInputs());

console.log('\nДоступные MIDI выходы:');
console.log(easymidi.getOutputs());

const input = new easymidi.Input('ipMIDI Port 5');
console.log('\nСлушаем ipMIDI Port 5...');

input.on('cc', (msg) => {
    console.log('CC:', msg.controller, '=', msg.value);
});

input.on('noteon', (msg) => {
    console.log('Note On:', msg.note, 'velocity:', msg.velocity);
});

input.on('noteoff', (msg) => {
    console.log('Note Off:', msg.note);
});