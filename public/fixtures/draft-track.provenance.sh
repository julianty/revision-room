set -e
V=Samantha
say -v $V -r 130 -o s0.aiff "Business Bangerz. Draft two. Scratch vocal."
say -v $V -r 105 -o s1.aiff "Verse one. Monday morning and the invoice queue is climbing, but we ship it anyway."
say -v $V -r 105 -o s2.aiff "Chorus. We are the ones who get it done, we are the ones who get it done."
say -v $V -r 105 -o s3.aiff "Verse two. Synergy in the atrium, our paradigm is truly maximum, baby."
say -v $V -r 105 -o s4.aiff "Chorus. We are the ones who get it done, we are the ones who get it done."
ffmpeg -y -loglevel error \
 -f lavfi -i "sine=frequency=110:duration=76" \
 -f lavfi -i "sine=frequency=164.81:duration=76" \
 -f lavfi -i "sine=frequency=220:duration=76" \
 -i s0.aiff -i s1.aiff -i s2.aiff -i s3.aiff -i s4.aiff \
 -filter_complex "\
[0]volume=0.06[b0];[1]volume=0.05[b1];[2]volume=0.035[b2];\
[3]adelay=1000|1000,volume=1.5[v0];\
[4]adelay=9000|9000,volume=1.5[v1];\
[5]adelay=26000|26000,volume=1.5[v2];\
[6]adelay=43000|43000,volume=1.5[v3];\
[7]adelay=60000|60000,volume=1.5[v4];\
[b0][b1][b2][v0][v1][v2][v3][v4]amix=inputs=8:duration=first:normalize=0,alimiter=limit=0.9[a]" \
 -map "[a]" -ac 2 -ar 44100 -b:a 128k draft-track.mp3
