import express from 'express';
import http from 'http';
import { Server } from 'socket.io'
import cors from 'cors'

const app = express();
app.use(cors());

const server = http.createServer(app);

const io = new Server(server, {
	cors : {
		origin : process.env.client_URL || '*',
	}
});

server.listen(process.env.port || 3000, () => console.log('running!'));

const id = (id => () => id++)(0);
let room : string = '';

io.on("connection", s => {
	// console.log(`new connection ${s.id}!`);

	const r = room || `game-room-${id()}`;
	s.join(r);

	// console.log(`socket ${s.id} joined ${r}`);

	const ready = room !== ''; //false
	room = ready ? '' : r;

	s.on("disconnecting", _ => {
		room = '';
		// console.log(`lost connection ${s.id}`);
  });

	s.emit('room_joined', { players : room === '' ? 2 : 1 });
	
	if(ready) 
		startGame(r);
	
});

/* GAME LOGIC */
enum cellState { x = -1, n, y, };
type player = cellState.x | cellState.y;
type moves = [number | null, number | null, number | null];

const genState = () => ({
	[-1] : [null,null,null] as moves,
	[ 1] : [null,null,null] as moves,
});

// [3,9,12,15,21]:

function checkWin(squares : number[]) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6],
  ];
  for (const [a, b, c] of lines) 
    if (squares[a] && squares[a] === squares[b] && squares[a] === squares[c]) 
      return squares[a];
  
  return cellState.n;
}

function startGame(r : string) {

	io.to(r).emit('game_start');



	const [play_turn, do_rematch] = (state => [({ coord, turn } : {
		coord : number;
		turn : player;
	}) => {		

		if (state[cellState.x].includes(coord) || state[cellState.y].includes(coord))
			return void io.to(r).emit('turn', { state, turn });

		state[turn] = [...state[turn].slice(1), coord] as any;

    const board = Array(9).fill(cellState.n);
    for (const e of state[cellState.x]) if (e !== null) board[e] = cellState.x;
    for (const e of state[cellState.y]) if (e !== null) board[e] = cellState.y;

		if (checkWin(board) !== cellState.n)
			return io.to(r).emit('game_end', { state, winner : turn });

		io.to(r).emit('turn', {
			state,
			turn : -turn
		});
		
	}, () => {
		Object.assign(state, genState());
		io.to(r).emit('rematch', { state });
	}])(genState());

	for (const s of io.sockets.adapter.rooms.get(r)!.values()) {
		const socket = io.sockets.sockets.get(s)!;
		socket.on('turn', play_turn);
		socket.on('rematch', do_rematch);

	}

	// console.log(`game started in room ${r} with sockets: ${ sockets.join(', ') }`);
}