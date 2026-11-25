# Third-party notices

## @breezystack/lamejs 1.2.7

Audio Studio uses `@breezystack/lamejs` as an unmodified, separately loaded MP3 encoding module in a dedicated Web Worker.

- JavaScript package source: https://github.com/shijinyu/lamejs
- Original LAME project: https://lame.sourceforge.net/
- Package: https://www.npmjs.com/package/@breezystack/lamejs
- License: GNU Lesser General Public License, version 3 (LGPL-3.0)
- License text: [`licenses/LGPL-3.0.txt`](licenses/LGPL-3.0.txt) and https://www.gnu.org/licenses/lgpl-3.0.html

The dependency is dynamically isolated in the MP3 worker bundle rather than copied into Audio Studio's own source. The dependency version is pinned in `package.json`; the resolved package and transitive dependency metadata must be captured in `package-lock.json` on the project machine.

This notice is not legal advice. Before distributing a proprietary or commercial build, review the LGPL requirements for the exact distribution model and ensure users can replace or relink the library as required by the licence.
