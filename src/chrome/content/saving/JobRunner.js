/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1/GPL 2.0/LGPL 2.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is Mozilla Archive Format.
 *
 * The Initial Developer of the Original Code is
 * Paolo Amadini <http://www.amadzone.org/>.
 * Portions created by the Initial Developer are Copyright (C) 2009
 * the Initial Developer. All Rights Reserved.
 *
 * Contributor(s):
 *
 * Alternatively, the contents of this file may be used under the terms of
 * either the GNU General Public License Version 2 or later (the "GPL"), or
 * the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
 * in which case the provisions of the GPL or the LGPL are applicable instead
 * of those above. If you wish to allow use of your version of this file only
 * under the terms of either the GPL or the LGPL, and not to allow others to
 * use your version of this file under the terms of the MPL, indicate your
 * decision by deleting the provisions above and replace them with the notice
 * and other provisions required by the GPL or the LGPL. If you do not delete
 * the provisions above, a recipient may use your version of this file under
 * the terms of any one of the MPL, the GPL or the LGPL.
 *
 * ***** END LICENSE BLOCK ***** */

/**
 * Provides the base class for a cancelable job that runs other child jobs,
 * either in parallel or one at a time.
 *
 * This class derives from Job. See the Job documentation for details.
 *
 * @param aRunInParallel
 *        False if the jobs should be started one after the other, or true to
 *        start them all at the same time.
 */
function JobRunner(aEventListener, aRunInParallel) {
  Job.call(this, aEventListener);
  this._runInParallel = aRunInParallel;

  // Initialize other member variables explicitly for proper inheritance.
  this._jobs = [];
}

JobRunner.prototype = {
  __proto__: Job.prototype,

  /**
   * The list of jobs to be executed.
   */
  _jobs: [],

  /**
   * Adds a new job at the end of the current list.
   *
   * @param aJob
   *        The job object to be added. This object must have been constructed
   *        with this runner as event listener.
   */
  _addJob: function(aJob) {
    this._jobs.push(aJob);
  },

  // Job
  _executeStart: function() {
    // Start the remaining jobs in order.
    for (var i = 0; i < this._jobs.length; i++) {
      var job = this._jobs[i];
      if (!job.startedByRunner) {
        job.startedByRunner = true;
        // Start the next job.
        job.start();
        // If required, do not start more than one job at a time.
        if (!this._runInParallel) {
          break;
        }
      }
    }
  },

  // Job
  _executeCancel: function(aReason) {
    // Cancel all the jobs.
    this._jobs.forEach(function(job) {
      job.cancel(aReason);
    }, this);
  },

  // Job
  _checkIfCompleted: function() {
    // Check if all the jobs are completed or canceled.
    var allJobsCompleted = true;
    this._jobs.forEach(function(job) {
      if (!job.isCompleted) {
        allJobsCompleted = false;
      }
    }, this);
    return allJobsCompleted;
  },

  // JobEventListener
  onJobProgressChange: function(aJob, aWebProgress, aRequest, aCurSelfProgress,
   aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress) {
    // Sum the progress, in bytes, of all the child jobs that are started.
    var numStartedJobs = 0;
    var numUnstartedJobs = 0;
    var curStartedProgress = 0;
    var maxStartedProgress = 0;
    this._jobs.forEach(function(job) {
      if (job.startedByRunner) {
        // If the job is started, use its progress indication.
        if (job.maxJobProgress > 0) {
          curStartedProgress += job.curJobProgress;
          maxStartedProgress += job.maxJobProgress;
        } else {
          // If the progress properties of the job contain no meaningful value,
          // use dummy byte values to indicate the progress. This allows the
          // progress bar to advance when monitoring multiple jobs with a
          // persister that doesn't report the download progress.
          maxStartedProgress += 1;
          if (job.isCompleted) {
            curStartedProgress += 1;
          }
        }
        numStartedJobs++;
      } else {
        numUnstartedJobs++;
      }
    }, this);
    // Estimate total progress for unstarted jobs.
    var maxUnstartedProgress;
    if (!numStartedJobs) {
      // No jobs are started, use a dummy byte value for the total progress.
      maxUnstartedProgress = 100;
    } else {
      // Assume that the remaining jobs will have the same average byte count.
      maxUnstartedProgress = Math.floor(maxStartedProgress / numStartedJobs) *
       numUnstartedJobs;
    }
    // Propagate the event to our listener.
    this._notifyJobProgressChange(aWebProgress, aRequest, aCurSelfProgress,
     aMaxSelfProgress, curStartedProgress, maxStartedProgress +
     maxUnstartedProgress);
  },

  // JobEventListener
  onJobComplete: function(aJob, aResult) {
    // If an error occurred with any one of the jobs
    if (aResult != Cr.NS_OK) {
      // Cancel all the remaining jobs.
      this.cancel(aResult);
      return;
    }

    // Check the completed job progress even if not previously notified.
    this.onJobProgressChange(aJob, null, null, 0, 0, aJob.curJobProgress,
     aJob.maxJobProgress);

    // Start the next job if required.
    if (!this._runInParallel) {
      try {
        this._executeStart();
      } catch(e) {
        // An exception when starting the next job must cause the entire
        // operation to be canceled.
        Cu.reportError(e);
        // Preserve the result code of XPCOM exceptions.
        if (e instanceof Ci.nsIXPCException) {
          this.cancel(e.result);
        } else {
          this.cancel(Cr.NS_ERROR_FAILURE);
        }
        return;
      }
    }

    // See if the operation is completed.
    this._notifyPossibleCompletion();
  },

  // JobEventListener
  onStatusChange: function(aWebProgress, aRequest, aStatus, aMessage) {
    // Propagate this download event unaltered.
    this._eventListener.onStatusChange(aWebProgress, aRequest, aStatus,
     aMessage);
  },

  /**
   * True if start() should run all the jobs immediately, or false if start()
   * should run the jobs one at a time, in order.
   */
  _runInParallel: false,
}
