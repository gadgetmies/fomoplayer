// import React from 'react';
// import ReactDOM from 'react-dom';
// import './index.css';
// import App from './App';
// import registerServiceWorker from './registerServiceWorker';

// ReactDOM.render(<App />, document.getElementById('root'));
// registerServiceWorker();

import * as React from 'karet'
import * as U from 'karet.util'
import { render } from 'react-dom'
import mybp from './mybp'
import * as L from 'partial.lenses'
import * as R from 'ramda'
import * as K from 'kefir'
import './App.css'

const state = U.atom({tracks: mybp.tracks, playing: false, currentTrack: mybp.tracks[0], selectedTrack: null})

const TrackDetails = ({track}) => 
    <span>
        {U.lift(L.join)(', ', ['artists', L.elems, 'name'], track)} - {U.view(['title'], track)}
    </span>

const Track = ({ track, currentTrack}) =>
    <div onClick={() => U.set(currentTrack, track)}
         className={U.ift(U.equals(currentTrack, track), 'selected')}>
        {U.view('id', currentTrack)}
        <TrackDetails track={track} />
    </div>

const Tracks = ({ tracks, selectedTrack, currentTrack }) =>
    <div style={{height: 400, overflow: 'scroll'}}>
        {U.mapElems(
            (track, i) => <Track key={U.view('id', track)} i={i} track={track} currentTrack={currentTrack} />,
            tracks
        )}
    </div>

const Preview = ({preloadTracks, currentTrack}) =>
    <div>
        <TrackDetails track={U.view([0], preloadTracks)} />
        {U.seq(
            preloadTracks,
            U.lift(U.show),
            U.mapElems((track, i) => 
                <source key={`preview-${U.view('id', track)}`} 
                        src={U.view(['preview', 'mp3', 'url'], track)}
                        data-controls={U.ifte(currentTrack.map(U.equals(i)), 'selected', '')}
                        controls="true"
                        />)
        )}<br/>
        <button onClick={() => currentTrack.modify(U.dec)}>Previous</button>
        <button onClick={() => {}}>Play / pause</button>
        <button onClick={() => currentTrack.modify(U.inc)}>Next</button>
    </div>

const App = ({ state }) => {
    const tracks = U.view('tracks', state)
    const currentTrack = U.view('currentTrack', state)

    return <div>
        <Tracks tracks={tracks} 
            currentTrack={currentTrack}
            selectedTrack={U.view('selectedTrack', state)}/>
        <Preview preloadTracks={K.combine([U.view('currentTrack', state), tracks], (current, tracks) => tracks.slice(current, current + 4))}
            currentTrack={currentTrack}/>
    </div>
}

render(<App state={state} />, document.getElementById('root'))
